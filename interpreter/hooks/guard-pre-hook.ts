import type { HookDecision, PreHook } from './HookManager';
import type { GuardResult } from '@core/types/guard';
import type { Variable } from '@core/types/variable';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import {
  evaluatePolicyAuthorizationDecision,
  hasToolWriteAuthorizationPolicy
} from '@core/policy/authorizations';
import {
  checkLabelFlow,
  checkExplicitLabelFlowRules
} from '@core/policy/label-flow';
import { evaluateAuthorizationInheritedPolicyChecks } from '@core/policy/guards';
import { guardSnapshotDescriptor } from './guard-utils';
import { isVariable } from '../utils/variable-resolution';
import { MlldSecurityError } from '@core/errors';
import { isDirectiveHookTarget } from '@core/types/hooks';
import { materializeGuardInputs } from '../utils/guard-inputs';
import { makeSecurityDescriptor } from '@core/types/security';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
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
import type { GuardDefinition } from '../guards';
import { buildOperationSnapshot } from './guard-operation-keys';
import {
  buildVariablePreview,
  hasSecretLabel,
  normalizeGuardReplacements,
  redactVariableForErrorOutput
} from './guard-materialization';
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
import {
  buildGuardArgsSnapshot,
  getGuardArgNamesFromMetadata
} from '../utils/guard-args';

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
    taint: Array.isArray(currentInput.mx?.taint) ? currentInput.mx.taint : [],
    toolsHistory: Array.isArray(currentInput.mx?.tools) ? currentInput.mx.tools : []
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

function getActivePolicyName(env: Parameters<PreHook>[2]): string {
  const policyContext = env.getPolicyContext() as { activePolicies?: unknown } | undefined;
  const activePolicies = Array.isArray(policyContext?.activePolicies)
    ? policyContext.activePolicies.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return activePolicies.length > 0 ? activePolicies.join(', ') : 'policy';
}

function buildLabelPolicyGuardResult(options: {
  env: Parameters<PreHook>[2];
  operation: NonNullable<Parameters<PreHook>[3]>;
  input: Variable;
  index: number;
  locked: boolean;
}): GuardResult | null {
  const inputDescriptor = options.input.mx ? varMxToSecurityDescriptor(options.input.mx) : undefined;
  const inputTaint = descriptorToInputTaint(inputDescriptor);
  if (inputTaint.length === 0) {
    return null;
  }

  const policy = options.env.getPolicySummary();
  const result = checkExplicitLabelFlowRules(
    {
      inputTaint,
      opLabels: options.operation.opLabels ?? [],
      exeLabels: options.operation.labels ?? []
    },
    policy
  );
  if (result.allowed) {
    return null;
  }

  return {
    guardName: null,
    decision: 'deny',
    reason: result.reason,
    timing: 'before',
    metadata: {
      guardName: null,
      guardFilter: result.rule ?? 'policy.labels',
      scope: 'perInput',
      inputPreview: buildVariablePreview(options.input),
      guardInput: hasSecretLabel(options.input)
        ? redactVariableForErrorOutput(options.input)
        : options.input,
      reason: result.reason,
      decision: 'deny',
      policyName: getActivePolicyName(options.env),
      policyRule: result.rule ?? null,
      policyLocked: options.locked,
      guardPrivileged: false,
      policyGuard: true,
      guardScopeKey: `perInput:${options.index}`,
      guardActionMatched: true
    }
  };
}

function buildInterpolatedPolicyGuardResult(options: {
  env: Parameters<PreHook>[2];
  operation: NonNullable<Parameters<PreHook>[3]>;
  inputTaint: readonly string[];
  locked: boolean;
}): GuardResult | null {
  const policy = options.env.getPolicySummary();
  const result = checkLabelFlow(
    {
      inputTaint: options.inputTaint,
      opLabels: options.operation.opLabels ?? [],
      exeLabels: options.operation.labels ?? []
    },
    policy
  );
  if (result.allowed) {
    return null;
  }

  return {
    guardName: null,
    decision: 'deny',
    reason: result.reason,
    timing: 'before',
    metadata: {
      guardName: null,
      guardFilter: result.rule ?? 'policy.defaults.rules',
      scope: 'perOperation',
      inputPreview: '[interpolated operation input]',
      guardInput: '[interpolated operation input]',
      reason: result.reason,
      decision: 'deny',
      policyName: getActivePolicyName(options.env),
      policyRule: result.rule ?? null,
      policyLocked: options.locked,
      guardPrivileged: false,
      policyGuard: true,
      guardScopeKey: 'perOperation',
      guardActionMatched: true
    }
  };
}

function isToolWriteOperation(operation: NonNullable<Parameters<PreHook>[3]>): boolean {
  const labels = Array.isArray(operation.labels) ? operation.labels : [];
  return labels.some(label => label === 'tool:w' || label.startsWith('tool:w:'));
}

function getAuthorizationControlArgs(operation: NonNullable<Parameters<PreHook>[3]>): string[] {
  const controlArgs = operation.metadata?.authorizationControlArgs;
  if (!Array.isArray(controlArgs)) {
    return [];
  }
  return controlArgs.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function createAuthorizationGuard(
  env: Parameters<PreHook>[2],
  operation: NonNullable<Parameters<PreHook>[3]>
): GuardDefinition | null {
  const policy = env.getPolicySummary();
  if (!policy?.authorizations || !hasToolWriteAuthorizationPolicy(policy.authorizations)) {
    return null;
  }
  if (!operation.name || !isToolWriteOperation(operation)) {
    return null;
  }

  const controlArgs = getAuthorizationControlArgs(operation);
  return {
    id: '__policy_authorizations__',
    name: '__policy_authorizations__',
    filterKind: 'operation',
    filterValue: 'tool:w',
    scope: 'perOperation',
    modifier: 'default',
    block: {
      type: 'GuardBlock',
      nodeId: '__policy_authorizations__',
      location: null as any,
      modifier: 'default',
      rules: []
    },
    registrationOrder: Number.MAX_SAFE_INTEGER,
    timing: 'before',
    privileged: true,
    policyGuardMode: policy.locked === true ? 'policy' : 'authorization',
    policyCondition: ({ args, argDescriptors, operation: policyOperation }) => {
      const decision = evaluatePolicyAuthorizationDecision({
        authorizations: policy.authorizations!,
        operationName: operation.name!,
        args: args ?? {},
        controlArgs
      });
      if (decision.decision === 'allow') {
        const inheritedCheckFailure = evaluateAuthorizationInheritedPolicyChecks({
          policy,
          operation: policyOperation,
          args,
          argDescriptors
        });
        if (!inheritedCheckFailure) {
          return { decision: 'allow' };
        }
        return {
          decision: 'deny',
          reason: inheritedCheckFailure.reason,
          policyName: getActivePolicyName(env),
          rule: inheritedCheckFailure.rule,
          suggestions: inheritedCheckFailure.suggestions,
          locked: true
        };
      }
      return {
        decision: 'deny',
        reason: decision.reason,
        policyName: getActivePolicyName(env),
        rule:
          decision.code === 'unlisted'
            ? 'policy.authorizations.unlisted'
            : 'policy.authorizations.args',
        locked: true
      };
    }
  };
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
    const authorizationGuard = createAuthorizationGuard(env, operation);
    if (authorizationGuard) {
      operationGuards.push(authorizationGuard);
    }
    const policySummary = env.getPolicySummary();
    const hasSyntheticLabelPolicies = Boolean(
      policySummary?.labels && Object.keys(policySummary.labels).length > 0
    );
    const policyInputTaint =
      Array.isArray(operation.metadata?.policyInputTaint)
        ? operation.metadata.policyInputTaint.filter(
            (entry): entry is string => typeof entry === 'string' && entry.length > 0
          )
        : [];
    const hasInterpolatedPolicyInputs = policyInputTaint.length > 0;

    if (
      perInputCandidates.length === 0 &&
      operationGuards.length === 0 &&
      !hasSyntheticLabelPolicies &&
      !hasInterpolatedPolicyInputs
    ) {
      return { action: 'continue' };
    }

    const attemptStore = getAttemptStore(env);
    const guardTrace: GuardResult[] = [];
    const usedAttemptKeys = new Set<string>();
    const decisionState = createGuardDecisionState();

    const transformedInputs: Variable[] = [...variableInputs];
    const guardArgNames = getGuardArgNamesFromMetadata(operation.metadata);

    for (const candidate of perInputCandidates) {
      const attemptKey = buildGuardAttemptKey(operation, 'perInput', candidate.variable);
      usedAttemptKeys.add(attemptKey);
      const attemptState = attemptStore.get(attemptKey);
      const attemptNumber = attemptState?.nextAttempt ?? 1;
      const attemptHistory = attemptState ? attemptState.history.slice() : [];
      let currentInput = candidate.variable;

      for (const guard of candidate.guards) {
        const candidateWithCurrentInput = applyCurrentInputToCandidate(candidate, currentInput);
        const currentArgs = transformedInputs.slice();
        currentArgs[candidate.index] = currentInput;
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
          inputHelper: helpers?.guard,
          args: buildGuardArgsSnapshot(currentArgs, guardArgNames)
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

    if (policySummary?.labels && Object.keys(policySummary.labels).length > 0) {
      for (let index = 0; index < transformedInputs.length; index += 1) {
        const input = transformedInputs[index];
        if (!input) {
          continue;
        }
        const labelPolicyResult = buildLabelPolicyGuardResult({
          env,
          operation,
          input,
          index,
          locked: policySummary.locked === true
        });
        if (!labelPolicyResult) {
          continue;
        }
        guardTrace.push(labelPolicyResult);
        applyGuardDecisionResult(decisionState, labelPolicyResult, { retryOverridesDeny: false });
      }
    }

    if (policyInputTaint.length > 0) {
      const coveredTaint = new Set<string>();
      for (const input of transformedInputs) {
        const descriptor = input?.mx ? varMxToSecurityDescriptor(input.mx) : undefined;
        for (const taint of descriptorToInputTaint(descriptor)) {
          coveredTaint.add(taint);
        }
      }

      const syntheticTaint = policyInputTaint.filter(taint => !coveredTaint.has(taint));
      if (syntheticTaint.length > 0) {
        const interpolatedPolicyResult = buildInterpolatedPolicyGuardResult({
          env,
          operation,
          inputTaint: syntheticTaint,
          locked: policySummary?.locked === true
        });
        if (interpolatedPolicyResult) {
          guardTrace.push(interpolatedPolicyResult);
          applyGuardDecisionResult(decisionState, interpolatedPolicyResult, {
            retryOverridesDeny: false
          });
        }
      }
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
          inputHelper: helpers?.guard,
          args: buildGuardArgsSnapshot(transformedInputs, guardArgNames)
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
      envGuard: decisionState.selectedEnvGuard,
      policyFragment: decisionState.selectedPolicyFragment,
      policyGuard: decisionState.selectedPolicyGuard
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
