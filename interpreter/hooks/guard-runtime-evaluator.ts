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
import type { Variable, VariableSource } from '@core/types/variable';
import { createArrayVariable, createSimpleTextVariable } from '@core/types/variable';
import { attachArrayHelpers } from '@core/types/variable/ArrayHelpers';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import type { PerInputCandidate } from './guard-candidate-selection';
import type { OperationSnapshot } from './guard-operation-keys';
import type { GuardAttemptEntry, GuardAttemptState } from './guard-retry-state';
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
  resolveGuardEnvConfig: (action: GuardActionNode, guardEnv: Environment) => Promise<unknown>;
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
  const inputPreview = buildInputPreview(scope, options.perInput, options.operationSnapshot) ?? null;
  let outputValue: unknown;

  if (scope === 'perInput' && options.perInput) {
    inputVariable = cloneVariableForGuard(options.perInput.variable);
    contextLabels = options.perInput.labels;
    contextSources = options.perInput.sources;
    contextTaint = options.perInput.taint;
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
      metadata: { security: makeSecurityDescriptor({ labels: contextLabels, sources: contextSources }) },
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
    inputPreview: isSecretContext ? '[REDACTED]' : inputPreview,
    outputPreview: isSecretContext ? '[REDACTED]' : buildVariablePreview(guardOutputVariable),
    hintHistory: options.attemptHistory.map(entry => entry.hint ?? null),
    timing: 'before'
  };

  const contextSnapshotForMetadata = cloneGuardContextSnapshot(guardContext);

  deps.logGuardEvaluationStart({
    guard,
    node: options.node,
    operation,
    scope,
    attempt: options.attemptNumber,
    inputPreview
  });

  if (guard.policyCondition) {
    const policyInput = options.perInput
      ? {
          labels: options.perInput.labels,
          taint: options.perInput.taint,
          sources: options.perInput.sources
        }
      : undefined;
    const policyResult = guard.policyCondition({ operation, input: policyInput });
    if (policyResult.decision === 'deny') {
      const metadataBase: Record<string, unknown> = {
        guardName: guard.name ?? null,
        guardFilter: `${guard.filterKind}:${guard.filterValue}`,
        scope,
        inputPreview,
        guardContext: contextSnapshotForMetadata,
        guardInput: hasSecretLabel(inputVariable!) ? redactVariableForErrorOutput(inputVariable!) : inputVariable!,
        reason: policyResult.reason,
        decision: 'deny',
        policyName: policyResult.policyName ?? null,
        policyRule: policyResult.rule ?? null,
        policySuggestions: policyResult.suggestions
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
        guardFilter: `${guard.filterKind}:${guard.filterValue}`,
        scope,
        inputPreview,
        guardContext: contextSnapshotForMetadata,
        guardInput: hasSecretLabel(inputVariable!) ? redactVariableForErrorOutput(inputVariable!) : inputVariable!
      }
    };
  }

  const action = await env.withGuardContext(guardContext, async () => {
    return await deps.evaluateGuardBlock(guard.block, guardEnv);
  });

  const metadataBase: Record<string, unknown> = {
    guardName: guard.name ?? null,
    guardFilter: `${guard.filterKind}:${guard.filterValue}`,
    scope,
    inputPreview,
    guardContext: contextSnapshotForMetadata,
    guardInput: hasSecretLabel(inputVariable) ? redactVariableForErrorOutput(inputVariable) : inputVariable
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
      metadata: metadataBase
    };
  }

  if (action.decision === 'env') {
    const envConfig = await deps.resolveGuardEnvConfig(action, guardEnv);
    const metadata = {
      ...metadataBase,
      decision: 'env',
      envConfig
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
      envConfig,
      metadata
    };
  }

  const metadata = deps.buildDecisionMetadata(action, guard, {
    inputPreview,
    attempt: options.attemptNumber,
    tries: options.attemptHistory,
    inputVariable,
    contextSnapshot: contextSnapshotForMetadata
  });

  deps.logGuardDecisionEvent({
    guard,
    node: options.node,
    operation,
    scope,
    attempt: options.attemptNumber,
    decision: action.decision,
    reason: action.decision === 'deny' ? action.message ?? null : null,
    hint: action.decision === 'retry' ? action.message ?? null : null,
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
      contextSnapshot: contextSnapshotForMetadata
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
  return {
    guardName: guard.name ?? null,
    decision: 'allow',
    timing: 'before',
    metadata
  };
}
