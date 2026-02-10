import type { GuardHint, GuardResult } from '@core/types/guard';

export type GuardAggregateDecision = 'allow' | 'deny' | 'retry';

export interface GuardDecisionState {
  decision: GuardAggregateDecision;
  reasons: string[];
  hints: GuardHint[];
  primaryMetadata?: Record<string, unknown>;
  selectedEnvConfig?: unknown;
  selectedEnvGuard: string | null | undefined;
}

export interface GuardDecisionOptions {
  retryOverridesDeny: boolean;
}

export function createGuardDecisionState(): GuardDecisionState {
  return {
    decision: 'allow',
    reasons: [],
    hints: [],
    selectedEnvGuard: undefined
  };
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
    return;
  }

  if (result.decision === 'deny') {
    state.decision = 'deny';
    if (result.reason) {
      state.reasons.push(result.reason);
    }
    if (!state.primaryMetadata && result.metadata) {
      state.primaryMetadata = result.metadata;
    }
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
