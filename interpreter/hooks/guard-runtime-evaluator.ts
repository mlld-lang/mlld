import type { GuardDefinition, GuardScope } from '../guards';
import type { Environment } from '../env/Environment';
import type { OperationContext, GuardContextSnapshot } from '../env/ContextManager';
import type { HookableNode } from '@core/types/hooks';
import type {
  GuardActionNode,
  GuardBlockNode,
  GuardDecisionType,
  GuardResult
} from '@core/types/guard';
import type { GuardEnvActionResolution } from './guard-action-evaluator';
import type { Variable, VariableSource } from '@core/types/variable';
import { createArrayVariable, createSimpleTextVariable } from '@core/types/variable';
import { attachArrayHelpers } from '@core/types/variable/ArrayHelpers';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import type { PerInputCandidate } from './guard-candidate-selection';
import type { OperationSnapshot } from './guard-operation-keys';
import type { GuardAttemptEntry, GuardAttemptState } from './guard-retry-state';
import type { PolicyArgDescriptor } from '../guards';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import {
  buildInputPreview,
  buildVariablePreview,
  cloneVariableForGuard,
  hasSecretLabel,
  hasSecretLabelInArray,
  redactVariableForErrorOutput,
  resolveGuardValue
} from './guard-materialization';
import { cloneGuardContextSnapshot } from './guard-context-snapshot';
import { attachGuardHelper } from './guard-helper-injection';
import { formatGuardFilterForMetadata } from './guard-filter-display';
import type { GuardArgsSnapshot } from '../utils/guard-args';
import { asData, extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';

interface BuildDecisionMetadataExtras {
  hint?: string | null;
  inputPreview?: string | null;
  attempt?: number;
  tries?: GuardAttemptEntry[];
  inputVariable?: Variable;
  contextSnapshot?: GuardContextSnapshot;
}

export interface EvaluateGuardRuntimeOptions {
  node: HookableNode;
  env: Environment;
  guard: GuardDefinition;
  operation: OperationContext;
  scope: GuardScope;
  perInput?: PerInputCandidate;
  operationSnapshot?: OperationSnapshot;
  attemptNumber: number;
  attemptHistory: GuardAttemptEntry[];
  attemptKey: string;
  attemptStore: Map<string, GuardAttemptState>;
  inputHelper?: GuardInputHelper;
  args?: GuardArgsSnapshot;
}

export interface EvaluateGuardRuntimeDependencies {
  defaultGuardMax: number;
  guardInputSource: VariableSource;
  prepareGuardEnvironment: (sourceEnv: Environment, guardEnv: Environment, guard: GuardDefinition) => void;
  injectGuardHelpers: (
    guardEnv: Environment,
    options: {
      operation: OperationContext;
      labels: readonly DataLabel[];
      operationLabels: readonly string[];
    }
  ) => void;
  evaluateGuardBlock: (block: GuardBlockNode, guardEnv: Environment) => Promise<GuardActionNode | undefined>;
  evaluateGuardReplacement: (
    action: GuardActionNode | undefined,
    guardEnv: Environment,
    guard: GuardDefinition,
    inputVariable: Variable
  ) => Promise<Variable | undefined>;
  resolveGuardEnvConfig: (
    action: GuardActionNode,
    guardEnv: Environment
  ) => Promise<GuardEnvActionResolution>;
  buildDecisionMetadata: (
    action: GuardActionNode,
    guard: GuardDefinition,
    extras?: BuildDecisionMetadataExtras
  ) => Record<string, unknown>;
  logGuardEvaluationStart: (options: {
    guard: GuardDefinition;
    node: HookableNode;
    operation: OperationContext;
    scope: GuardScope;
    attempt: number;
    inputPreview?: string | null;
  }) => void;
  logGuardDecisionEvent: (options: {
    guard: GuardDefinition;
    node: HookableNode;
    operation: OperationContext;
    scope: GuardScope;
    attempt: number;
    decision: GuardDecisionType;
    reason?: string | null;
    hint?: string | null;
    inputPreview?: string | null;
  }) => void;
}

function buildGuardScopeKey(options: EvaluateGuardRuntimeOptions): string {
  if (options.scope === 'perInput' && options.perInput) {
    return `perInput:${options.perInput.index}`;
  }
  return 'perOperation';
}

function snapshotPolicyArgs(args?: GuardArgsSnapshot): Readonly<Record<string, unknown>> | undefined {
  if (!args || args.names.length === 0) {
    return undefined;
  }

  const values = Object.create(null) as Record<string, unknown>;
  for (const name of args.names) {
    const variable = args.values[name];
    if (!variable) {
      continue;
    }
    const rawValue = variable.value;
    values[name] = isStructuredValue(rawValue) ? asData(rawValue) : rawValue;
  }

  return Object.freeze(values);
}

function snapshotPolicyArgDescriptors(
  args?: GuardArgsSnapshot
): Readonly<Record<string, PolicyArgDescriptor>> | undefined {
  if (!args || args.names.length === 0) {
    return undefined;
  }

  const descriptors = Object.create(null) as Record<string, PolicyArgDescriptor>;
  for (const name of args.names) {
    const variable = args.values[name];
    if (!variable) {
      continue;
    }

    const runtimeDescriptor = extractSecurityDescriptor(variable.value, {
      recursive: true,
      mergeArrayElements: true
    });
    const mergedDescriptor = mergeDescriptors(
      variable.mx ? varMxToSecurityDescriptor(variable.mx) : undefined,
      runtimeDescriptor
    );

    descriptors[name] = Object.freeze({
      labels: mergedDescriptor.labels.length > 0 ? Object.freeze([...mergedDescriptor.labels]) : undefined,
      taint: mergedDescriptor.taint.length > 0 ? Object.freeze([...mergedDescriptor.taint]) : undefined,
      attestations: mergedDescriptor.attestations.length > 0
        ? Object.freeze([...mergedDescriptor.attestations])
        : undefined,
      sources: mergedDescriptor.sources.length > 0 ? Object.freeze([...mergedDescriptor.sources]) : undefined,
      urls: (mergedDescriptor.urls?.length ?? 0) > 0 ? Object.freeze([...(mergedDescriptor.urls ?? [])]) : undefined
    });
  }

  return Object.keys(descriptors).length > 0 ? Object.freeze(descriptors) : undefined;
}

export async function evaluateGuardRuntime(
  options: EvaluateGuardRuntimeOptions,
  deps: EvaluateGuardRuntimeDependencies
): Promise<GuardResult> {
  const { env, guard, operation, scope } = options;
  const guardEnv = env.createChild();
  deps.prepareGuardEnvironment(env, guardEnv, guard);

  let inputVariable: Variable;
  let contextLabels: readonly DataLabel[];
  let contextSources: readonly string[];
  let contextTaint: readonly string[];
  let contextAttestations: readonly string[];
  let contextToolsHistory: readonly import('@core/types/security').ToolProvenance[];
  const inputPreview = buildInputPreview(scope, options.perInput, options.operationSnapshot) ?? null;
  let outputValue: unknown;

  if (scope === 'perInput' && options.perInput) {
    inputVariable = cloneVariableForGuard(options.perInput.variable);
    contextLabels = options.perInput.labels;
    contextSources = options.perInput.sources;
    contextTaint = options.perInput.taint;
    contextAttestations = options.perInput.attestations;
    contextToolsHistory = options.perInput.toolsHistory;
    outputValue = resolveGuardValue(options.perInput.variable, inputVariable);
  } else if (scope === 'perOperation' && options.operationSnapshot) {
    const arrayValue = options.operationSnapshot.variables.slice();
    inputVariable = createArrayVariable('input', arrayValue as any[], false, deps.guardInputSource, {
      isSystem: true,
      isReserved: true
    });
    attachArrayHelpers(inputVariable as any);
    contextLabels = options.operationSnapshot.aggregate.labels;
    contextSources = options.operationSnapshot.aggregate.sources;
    contextTaint = options.operationSnapshot.taint;
    contextAttestations = options.operationSnapshot.attestations;
    contextToolsHistory = options.operationSnapshot.toolsHistory;
    const primaryOutput = options.operationSnapshot.variables[0];
    outputValue = resolveGuardValue(primaryOutput, inputVariable);
  } else {
    return { guardName: guard.name ?? null, decision: 'allow' };
  }

  const outputText =
    typeof outputValue === 'string'
      ? outputValue
      : outputValue === undefined || outputValue === null
        ? ''
        : String(outputValue);
  const guardOutputVariable = createSimpleTextVariable(
    'output',
    outputText as any,
    deps.guardInputSource,
    {
        metadata: {
          security: makeSecurityDescriptor({
            labels: contextLabels,
            taint: contextTaint,
            attestations: contextAttestations,
            sources: contextSources,
            tools: contextToolsHistory
          })
      },
      internal: { isReserved: true }
    }
  );

  guardEnv.setVariable('input', inputVariable);
  guardEnv.setVariable('output', guardOutputVariable);
  if (options.inputHelper) {
    attachGuardHelper(inputVariable, options.inputHelper);
  }

  deps.injectGuardHelpers(guardEnv, {
    operation,
    labels: contextLabels,
    operationLabels: operation.opLabels ?? []
  });

  const isSecretContext = hasSecretLabelInArray(contextLabels);
  const guardContext: GuardContextSnapshot = {
    name: guard.name,
    attempt: options.attemptNumber,
    try: options.attemptNumber,
    tries: options.attemptHistory.map(entry => ({ ...entry })),
    max: deps.defaultGuardMax,
    input: inputVariable,
    output: guardOutputVariable,
    labels: contextLabels,
    sources: contextSources,
    taint: contextTaint,
    attestations: contextAttestations,
    toolsHistory: contextToolsHistory,
    inputPreview: isSecretContext ? '[REDACTED]' : inputPreview,
    outputPreview: isSecretContext ? '[REDACTED]' : buildVariablePreview(guardOutputVariable),
    hintHistory: options.attemptHistory.map(entry => entry.hint ?? null),
    timing: 'before',
    args: options.args
  };

  const contextSnapshotForMetadata = cloneGuardContextSnapshot(guardContext);
  const scopeKey = buildGuardScopeKey(options);

  deps.logGuardEvaluationStart({
    guard,
    node: options.node,
    operation,
    scope,
    attempt: options.attemptNumber,
    inputPreview
  });

  if (guard.policyCondition) {
    const policyGuardMode = guard.policyGuardMode ?? 'policy';
    const policyInput = options.perInput
      ? {
          labels: options.perInput.labels,
          taint: options.perInput.taint,
          attestations: options.perInput.attestations,
          sources: options.perInput.sources,
          urls: Array.isArray(options.perInput.variable.mx?.urls) ? options.perInput.variable.mx?.urls : []
        }
      : undefined;
    const policyInputs = options.perInput
      ? [policyInput]
      : options.operationSnapshot
        ? options.operationSnapshot.variables.map(variable => ({
            labels: Array.isArray(variable.mx?.labels) ? variable.mx.labels : [],
            taint: Array.isArray(variable.mx?.taint) ? variable.mx.taint : [],
            attestations: Array.isArray(variable.mx?.attestations) ? variable.mx.attestations : [],
            sources: Array.isArray(variable.mx?.sources) ? variable.mx.sources : [],
            urls: Array.isArray(variable.mx?.urls) ? variable.mx.urls : []
          }))
        : undefined;
    const policyResult = guard.policyCondition({
      operation,
      argName: options.perInput?.argName ?? undefined,
      args: snapshotPolicyArgs(options.args),
      argDescriptors: snapshotPolicyArgDescriptors(options.args),
      input: policyInput,
      inputs: policyInputs,
      urlRegistry: env.getKnownUrls()
    });
    if (policyResult.decision === 'deny') {
      const metadataBase: Record<string, unknown> = {
        guardName: guard.name ?? null,
        guardFilter: formatGuardFilterForMetadata(guard.filterKind, guard.filterValue),
        scope,
        inputPreview,
        guardContext: contextSnapshotForMetadata,
        guardInput: hasSecretLabel(inputVariable!) ? redactVariableForErrorOutput(inputVariable!) : inputVariable!,
        reason: policyResult.reason,
        decision: 'deny',
        policyName: policyResult.policyName ?? null,
        policyRule: policyResult.rule ?? null,
        policySuggestions: policyResult.suggestions,
        policyLocked: policyResult.locked === true,
        guardPrivileged: guard.privileged === true,
        policyGuard: true,
        authorizationGuard: policyGuardMode === 'authorization',
        guardScopeKey: scopeKey,
        guardActionMatched: true
      };
      deps.logGuardDecisionEvent({
        guard,
        node: options.node,
        operation,
        scope,
        attempt: options.attemptNumber,
        decision: 'deny',
        reason: policyResult.reason,
        hint: null,
        inputPreview
      });
      return {
        guardName: guard.name ?? null,
        decision: 'deny',
        timing: 'before',
        reason: policyResult.reason,
        metadata: {
          ...metadataBase,
          policyName: policyResult.policyName,
          policyRule: policyResult.rule,
          policySuggestions: policyResult.suggestions
        }
      };
    }
    return {
      guardName: guard.name ?? null,
      decision: 'allow',
      timing: 'before',
      metadata: {
        guardName: guard.name ?? null,
        guardFilter: formatGuardFilterForMetadata(guard.filterKind, guard.filterValue),
        scope,
        inputPreview,
        guardContext: contextSnapshotForMetadata,
        guardInput: hasSecretLabel(inputVariable!) ? redactVariableForErrorOutput(inputVariable!) : inputVariable!,
        guardPrivileged: guard.privileged === true,
        policyGuard: policyGuardMode === 'policy',
        authorizationGuard: policyGuardMode === 'authorization',
        guardScopeKey: scopeKey,
        guardActionMatched: policyGuardMode === 'authorization'
      }
    };
  }

  const action = await env.withGuardContext(guardContext, async () => {
    return await deps.evaluateGuardBlock(guard.block, guardEnv);
  });

  const metadataBase: Record<string, unknown> = {
    guardName: guard.name ?? null,
    guardFilter: formatGuardFilterForMetadata(guard.filterKind, guard.filterValue),
    scope,
    inputPreview,
    guardContext: contextSnapshotForMetadata,
    guardInput: hasSecretLabel(inputVariable) ? redactVariableForErrorOutput(inputVariable) : inputVariable,
    guardPrivileged: guard.privileged === true,
    policyGuard: false,
    guardScopeKey: scopeKey
  };

  if (!action || action.decision === 'allow') {
    const allowHint =
      action?.warning
        ? { guardName: guard.name ?? null, hint: action.warning, severity: 'warn' }
        : undefined;
    const replacement = await env.withGuardContext(guardContext, async () =>
      deps.evaluateGuardReplacement(action, guardEnv, guard, inputVariable)
    );
    return {
      guardName: guard.name ?? null,
      decision: 'allow',
      timing: 'before',
      replacement,
      hint: allowHint,
      metadata: {
        ...metadataBase,
        guardActionMatched: Boolean(action)
      }
    };
  }

  if (action.decision === 'env') {
    const envDecision = await deps.resolveGuardEnvConfig(action, guardEnv);
    const envConfig = envDecision.envConfig;
    const metadata = {
      ...metadataBase,
      decision: 'env',
      guardActionMatched: true,
      ...(envConfig !== undefined ? { envConfig } : {}),
      ...(envDecision.policyFragment ? { policyFragment: envDecision.policyFragment } : {})
    };
    deps.logGuardDecisionEvent({
      guard,
      node: options.node,
      operation,
      scope,
      attempt: options.attemptNumber,
      decision: 'env',
      reason: null,
      hint: null,
      inputPreview
    });
    return {
      guardName: guard.name ?? null,
      decision: 'env',
      timing: 'before',
      ...(envConfig !== undefined ? { envConfig } : {}),
      ...(envDecision.policyFragment ? { policyFragment: envDecision.policyFragment } : {}),
      metadata
    };
  }

  const metadata = deps.buildDecisionMetadata(action, guard, {
    inputPreview,
    attempt: options.attemptNumber,
    tries: options.attemptHistory,
    inputVariable,
    contextSnapshot: contextSnapshotForMetadata,
    scopeKey,
    guardActionMatched: true
  });

  deps.logGuardDecisionEvent({
    guard,
    node: options.node,
    operation,
    scope,
    attempt: options.attemptNumber,
    decision: action.decision,
    reason: action.decision === 'deny' ? action.message ?? null : null,
    hint:
      action.decision === 'retry' || action.decision === 'resume'
        ? action.message ?? null
        : null,
    inputPreview
  });

  if (action.decision === 'deny') {
    return {
      guardName: guard.name ?? null,
      decision: 'deny',
      timing: 'before',
      reason: metadata.reason as string | undefined,
      metadata
    };
  }
  if (action.decision === 'retry') {
    const entry: GuardAttemptEntry = {
      attempt: options.attemptNumber,
      decision: 'retry',
      hint: action.message ?? null
    };
    const updatedHistory = [...options.attemptHistory, entry];
    options.attemptStore.set(options.attemptKey, {
      nextAttempt: options.attemptNumber + 1,
      history: updatedHistory
    });
    const retryMetadata = deps.buildDecisionMetadata(action, guard, {
      hint: action.message ?? null,
      inputPreview,
      attempt: options.attemptNumber,
      tries: updatedHistory,
      inputVariable,
      contextSnapshot: contextSnapshotForMetadata,
      scopeKey,
      guardActionMatched: true
    });
    return {
      guardName: guard.name ?? null,
      decision: 'retry',
      timing: 'before',
      reason: retryMetadata.reason as string | undefined,
      hint: action.message
        ? { guardName: guard.name ?? null, hint: action.message }
        : undefined,
      metadata: retryMetadata
    };
  }
  if (action.decision === 'resume') {
    const entry: GuardAttemptEntry = {
      attempt: options.attemptNumber,
      decision: 'resume',
      hint: action.message ?? null
    };
    const updatedHistory = [...options.attemptHistory, entry];
    options.attemptStore.set(options.attemptKey, {
      nextAttempt: options.attemptNumber + 1,
      history: updatedHistory
    });
    const resumeMetadata = deps.buildDecisionMetadata(action, guard, {
      hint: action.message ?? null,
      inputPreview,
      attempt: options.attemptNumber,
      tries: updatedHistory,
      inputVariable,
      contextSnapshot: contextSnapshotForMetadata,
      scopeKey,
      guardActionMatched: true
    });
    return {
      guardName: guard.name ?? null,
      decision: 'resume',
      timing: 'before',
      reason: resumeMetadata.reason as string | undefined,
      hint: action.message
        ? { guardName: guard.name ?? null, hint: action.message }
        : undefined,
      metadata: resumeMetadata
    };
  }
  return {
    guardName: guard.name ?? null,
    decision: 'allow',
    timing: 'before',
    metadata
  };
}
