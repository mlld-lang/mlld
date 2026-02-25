import type { HookDecision, PreHook } from './HookManager';
import type { GuardResult } from '@core/types/guard';
import type { Variable } from '@core/types/variable';
import { guardSnapshotDescriptor } from './guard-utils';
import { isVariable } from '../utils/variable-resolution';
import { MlldSecurityError } from '@core/errors';
import { isDirectiveHookTarget } from '@core/types/hooks';
import { materializeGuardInputs } from '../utils/guard-inputs';
import { makeSecurityDescriptor } from '@core/types/security';
import { appendGuardHistory } from './guard-shared-history';
import {
  extractGuardOverride,
  normalizeGuardOverride
} from './guard-override-utils';
import {
  buildPerInputCandidates,
  collectOperationGuards,
  type PerInputCandidate
} from './guard-candidate-selection';
import { buildOperationSnapshot } from './guard-operation-keys';
import { normalizeGuardReplacements } from './guard-materialization';
import {
  applyGuardDecisionResult,
  createGuardDecisionState,
  shouldClearAttemptState,
  toHookAction
} from './guard-decision-reducer';
import {
  buildGuardAttemptKey,
  clearGuardAttemptStates,
  getAttemptStore
} from './guard-retry-state';
import {
  buildAggregateGuardContext,
  buildAggregateMetadata
} from './guard-pre-aggregation';
import {
  logGuardDecisionSummary,
  logGuardEmitContextDebug
} from './guard-pre-logging';
import { evaluatePreHookGuard } from './guard-pre-runtime';
import { getExpressionProvenance } from '../utils/expression-provenance';

function applyCurrentInputToCandidate(
  candidate: PerInputCandidate,
  currentInput: Variable
): PerInputCandidate {
  if (candidate.variable === currentInput) {
    return candidate;
  }

  return {
    ...candidate,
    variable: currentInput,
    labels: Array.isArray(currentInput.mx?.labels) ? currentInput.mx.labels : [],
    sources: Array.isArray(currentInput.mx?.sources) ? currentInput.mx.sources : [],
    taint: Array.isArray(currentInput.mx?.taint) ? currentInput.mx.taint : []
  };
}

function collectCandidateGuardIds(candidates: readonly PerInputCandidate[]): Set<string> {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    for (const guard of candidate.guards) {
      ids.add(guard.id);
    }
  }
  return ids;
}

export const guardPreHook: PreHook = async (
  node,
  inputs,
  env,
  operation,
  helpers
): Promise<HookDecision> => {
  if (!operation) {
    return { action: 'continue' };
  }

  if (isDirectiveHookTarget(node)) {
    if (node.kind === 'guard') {
      return { action: 'continue' };
    }
    if (node.kind === 'var' && node.meta?.isToolsCollection === true) {
      return { action: 'continue' };
    }
  }

  if (env.shouldSuppressGuards()) {
    return { action: 'continue' };
  }

  return env.withGuardSuppression(async () => {
    const guardOverride = normalizeGuardOverride(extractGuardOverride(node));

    if (guardOverride.kind === 'disableAll' || guardOverride.kind === 'except' || guardOverride.kind === 'only') {
      const projectConfig = env.getProjectConfig();
      if (projectConfig && !projectConfig.getAllowGuardBypass()) {
        throw new MlldSecurityError(
          'Guard bypass disabled by security config - guards cannot be skipped in this environment',
          { code: 'GUARD_BYPASS_BLOCKED' }
        );
      }
    }

    logGuardEmitContextDebug(env, operation);
    const registry = env.getGuardRegistry();
    const variableInputs = materializeGuardInputs(inputs, { nameHint: '__guard_input__' });

    const perInputCandidates = buildPerInputCandidates(registry, variableInputs, guardOverride);
    const operationGuards = collectOperationGuards(registry, operation, guardOverride, {
      excludeGuardIds: collectCandidateGuardIds(perInputCandidates),
      includeDataIndexForOperationKeys: variableInputs.length > 0
    });

    if (perInputCandidates.length === 0 && operationGuards.length === 0) {
      return { action: 'continue' };
    }

    const attemptStore = getAttemptStore(env);
    const guardTrace: GuardResult[] = [];
    const usedAttemptKeys = new Set<string>();
    const decisionState = createGuardDecisionState();

    const transformedInputs: Variable[] = [...variableInputs];

    for (const candidate of perInputCandidates) {
      const attemptKey = buildGuardAttemptKey(operation, 'perInput', candidate.variable);
      usedAttemptKeys.add(attemptKey);
      const attemptState = attemptStore.get(attemptKey);
      const attemptNumber = attemptState?.nextAttempt ?? 1;
      const attemptHistory = attemptState ? attemptState.history.slice() : [];
      let currentInput = candidate.variable;

      for (const guard of candidate.guards) {
        const candidateWithCurrentInput = applyCurrentInputToCandidate(candidate, currentInput);
        const result = await evaluatePreHookGuard({
          node,
          env,
          guard,
          operation,
          scope: 'perInput',
          perInput: candidateWithCurrentInput,
          attemptNumber,
          attemptHistory,
          attemptKey,
          attemptStore,
          inputHelper: helpers?.guard
        });
        guardTrace.push(result);
        applyGuardDecisionResult(decisionState, result, { retryOverridesDeny: false });
        if (result.decision === 'env') {
          continue;
        }
        if (result.decision === 'allow' && decisionState.decision === 'allow') {
          if (result.replacement && isVariable(result.replacement as Variable)) {
            currentInput = result.replacement as Variable;
          }
        }
      }

      transformedInputs[candidate.index] = currentInput;
    }

    if (operationGuards.length > 0) {
      const attemptKey = buildGuardAttemptKey(operation, 'perOperation');
      usedAttemptKeys.add(attemptKey);
      const attemptState = attemptStore.get(attemptKey);
      const attemptNumber = attemptState?.nextAttempt ?? 1;
      const attemptHistory = attemptState ? attemptState.history.slice() : [];
      let opSnapshot = buildOperationSnapshot(transformedInputs);

      for (const guard of operationGuards) {
        const result = await evaluatePreHookGuard({
          node,
          env,
          guard,
          operation,
          scope: 'perOperation',
          operationSnapshot: opSnapshot,
          attemptNumber,
          attemptHistory,
          attemptKey,
          attemptStore,
          inputHelper: helpers?.guard
        });
        guardTrace.push(result);
        applyGuardDecisionResult(decisionState, result, { retryOverridesDeny: true });
        if (result.decision === 'env') {
          continue;
        }
        if (result.decision === 'allow' && decisionState.decision === 'allow') {
          const replacements = normalizeGuardReplacements(result.replacement);
          if (replacements.length > 0) {
            transformedInputs.splice(0, transformedInputs.length, ...replacements);
            opSnapshot = buildOperationSnapshot(transformedInputs);
          }
        }
      }
    }

    const aggregateContext = buildAggregateGuardContext({
      decision: decisionState.decision,
      guardResults: guardTrace,
      hints: decisionState.hints,
      reasons: decisionState.reasons,
      primaryMetadata: decisionState.primaryMetadata
    });
    const aggregateMetadata = buildAggregateMetadata({
      guardResults: guardTrace,
      reasons: decisionState.reasons,
      hints: decisionState.hints,
      transformedInputs,
      primaryMetadata: decisionState.primaryMetadata,
      guardContext: aggregateContext,
      envConfig: decisionState.selectedEnvConfig,
      envGuard: decisionState.selectedEnvGuard
    });
    appendGuardHistory(
      env,
      operation,
      decisionState.decision,
      guardTrace,
      decisionState.hints,
      decisionState.reasons
    );
    const guardName =
      guardTrace[0]?.guard?.name ??
      guardTrace[0]?.guard?.filterKind ??
      '';
    const contextLabels = operation.labels ?? [];
    const provenance =
      env.isProvenanceEnabled?.() === true
        ? getExpressionProvenance(transformedInputs[0] ?? variableInputs[0]) ??
          guardSnapshotDescriptor(env) ??
          makeSecurityDescriptor()
        : undefined;
    env.emitSDKEvent({
      type: 'debug:guard:before',
      guard: guardName,
      labels: contextLabels,
      decision: decisionState.decision,
      trace: guardTrace,
      hints: decisionState.hints,
      reasons: decisionState.reasons,
      timestamp: Date.now(),
      ...(provenance && { provenance })
    });

    logGuardDecisionSummary({
      decision: decisionState.decision,
      operation,
      inputs,
      reasons: decisionState.reasons,
      hints: decisionState.hints,
      guardTrace
    });

    if (shouldClearAttemptState(decisionState.decision)) {
      clearGuardAttemptStates(attemptStore, usedAttemptKeys);
    }

    return {
      action: toHookAction(decisionState.decision),
      metadata: aggregateMetadata
    };
  });
};
