import type { GuardHint, GuardResult } from '@core/types/guard';
import type { PolicyConfig } from '@core/policy/union';

export type GuardAggregateDecision = 'allow' | 'deny' | 'retry';

export interface GuardDecisionState {
  decision: GuardAggregateDecision;
  reasons: string[];
  hints: GuardHint[];
  primaryMetadata?: Record<string, unknown>;
  selectedEnvConfig?: unknown;
  selectedEnvGuard: string | null | undefined;
  selectedPolicyFragment?: PolicyConfig;
  selectedPolicyGuard: string | null | undefined;
  privilegedPerInputAllows: Set<string>;
  privilegedPerOperationAllow: boolean;
  activePolicyDenyScope: string | null;
  activePolicyDenyLocked: boolean;
}

export interface GuardDecisionOptions {
  retryOverridesDeny: boolean;
}

export function createGuardDecisionState(): GuardDecisionState {
  return {
    decision: 'allow',
    reasons: [],
    hints: [],
    selectedEnvGuard: undefined,
    selectedPolicyGuard: undefined,
    privilegedPerInputAllows: new Set<string>(),
    privilegedPerOperationAllow: false,
    activePolicyDenyScope: null,
    activePolicyDenyLocked: false
  };
}

function getGuardMetadata(result: GuardResult): Record<string, unknown> {
  return (result.metadata ?? {}) as Record<string, unknown>;
}

function getScopeKey(result: GuardResult): string {
  const metadata = getGuardMetadata(result);
  return typeof metadata.guardScopeKey === 'string' ? metadata.guardScopeKey : 'perOperation';
}

function isPolicyGuardResult(result: GuardResult): boolean {
  return getGuardMetadata(result).policyGuard === true;
}

function isPolicyDenyLocked(result: GuardResult): boolean {
  return getGuardMetadata(result).policyLocked === true;
}

function isExplicitPrivilegedAllow(result: GuardResult): boolean {
  if (result.decision !== 'allow') {
    return false;
  }
  const metadata = getGuardMetadata(result);
  return (
    metadata.guardPrivileged === true &&
    metadata.policyGuard !== true &&
    metadata.guardActionMatched === true
  );
}

function canOverridePolicyDeny(state: GuardDecisionState, scopeKey: string): boolean {
  if (state.privilegedPerOperationAllow) {
    return true;
  }
  return scopeKey.startsWith('perInput:') && state.privilegedPerInputAllows.has(scopeKey);
}

function clearActivePolicyDeny(state: GuardDecisionState): void {
  state.decision = 'allow';
  state.reasons = [];
  state.primaryMetadata = undefined;
  state.activePolicyDenyScope = null;
  state.activePolicyDenyLocked = false;
}

export function applyGuardDecisionResult(
  state: GuardDecisionState,
  result: GuardResult,
  options: GuardDecisionOptions
): void {
  if (result.hint) {
    state.hints.push(result.hint);
  }

  if (result.decision === 'env') {
    if (state.selectedEnvConfig === undefined && result.envConfig !== undefined) {
      state.selectedEnvConfig = result.envConfig;
      state.selectedEnvGuard = result.guardName ?? null;
    }
    if (state.selectedPolicyFragment === undefined && result.policyFragment !== undefined) {
      state.selectedPolicyFragment = result.policyFragment;
      state.selectedPolicyGuard = result.guardName ?? null;
    }
    return;
  }

  if (isExplicitPrivilegedAllow(result)) {
    const scopeKey = getScopeKey(result);
    if (scopeKey === 'perOperation') {
      state.privilegedPerOperationAllow = true;
    } else {
      state.privilegedPerInputAllows.add(scopeKey);
    }
    if (
      state.decision === 'deny' &&
      state.activePolicyDenyScope &&
      !state.activePolicyDenyLocked &&
      (scopeKey === 'perOperation' || scopeKey === state.activePolicyDenyScope)
    ) {
      clearActivePolicyDeny(state);
    }
    return;
  }

  if (result.decision === 'deny') {
    const scopeKey = getScopeKey(result);
    const policyGuard = isPolicyGuardResult(result);
    const policyLocked = isPolicyDenyLocked(result);
    if (policyGuard && !policyLocked && canOverridePolicyDeny(state, scopeKey)) {
      return;
    }
    state.decision = 'deny';
    if (result.reason) {
      state.reasons.push(result.reason);
    }
    if (!state.primaryMetadata && result.metadata) {
      state.primaryMetadata = result.metadata;
    }
    state.activePolicyDenyScope = policyGuard ? scopeKey : null;
    state.activePolicyDenyLocked = policyGuard && policyLocked;
    return;
  }

  if (result.decision === 'retry') {
    if (state.decision === 'deny' && !options.retryOverridesDeny) {
      return;
    }
    state.decision = 'retry';
    if (result.reason) {
      state.reasons.push(result.reason);
    }
    if (!state.primaryMetadata && result.metadata) {
      state.primaryMetadata = result.metadata;
    }
    state.activePolicyDenyScope = null;
    state.activePolicyDenyLocked = false;
    return;
  }
}

export function shouldClearAttemptState(decision: GuardAggregateDecision): boolean {
  return decision !== 'retry';
}

export function toHookAction(decision: GuardAggregateDecision): 'continue' | 'retry' | 'abort' {
  if (decision === 'allow') {
    return 'continue';
  }
  if (decision === 'retry') {
    return 'retry';
  }
  return 'abort';
}
