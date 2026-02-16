import { astLocationToSourceLocation } from '@core/types';
import type { GuardActionNode, GuardBlockNode, GuardResult } from '@core/types/guard';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import type { Variable, VariableSource } from '@core/types/variable';
import { createArrayVariable, createSimpleTextVariable } from '@core/types/variable';
import { attachArrayHelpers } from '@core/types/variable/ArrayHelpers';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import { MlldWhenExpressionError } from '@core/errors';
import type { OperationContext, GuardContextSnapshot } from '../env/ContextManager';
import type { Environment } from '../env/Environment';
import type { GuardDefinition } from '../guards/GuardRegistry';
import type { PerInputCandidate } from './guard-candidate-selection';
import type { GuardOperationSnapshot } from './guard-post-decision-engine';
import {
  buildPostDecisionMetadata,
  evaluatePostGuardBlock,
  evaluatePostGuardReplacement,
  type BuildPostDecisionMetadataExtras,
  type PostGuardReplacementDependencies
} from './guard-post-runtime-actions';
import { extractGuardLabelModifications } from './guard-utils';

const DEFAULT_GUARD_MAX = 3;

export interface EvaluatePostGuardRuntimeOptions {
  env: Environment;
  guard: GuardDefinition;
  operation: OperationContext;
  scope: 'perInput' | 'perOperation';
  perInput?: PerInputCandidate;
  operationSnapshot?: GuardOperationSnapshot;
  operationInputSnapshot?: GuardOperationSnapshot;
  inputHelper?: GuardInputHelper;
  activeInput?: Variable;
  activeOutput?: Variable;
  labelsOverride?: readonly DataLabel[];
  sourcesOverride?: readonly string[];
  inputPreviewOverride?: string | null;
  outputRaw?: unknown;
  attemptNumber?: number;
  attemptHistory?: Array<{ attempt?: number; decision?: string; hint?: string | null }>;
  maxAttempts?: number;
  hintHistory?: Array<string | null>;
}

export interface EvaluatePostGuardRuntimeDependencies {
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
  attachGuardInputHelper: (target: Variable, helper: GuardInputHelper) => void;
  cloneVariable: (variable: Variable) => Variable;
  resolveGuardValue: (variable: Variable | undefined, fallback: Variable) => unknown;
  buildVariablePreview: (variable: Variable) => string | null;
  replacementDependencies: PostGuardReplacementDependencies;
  evaluateGuardBlock?: (block: GuardBlockNode, guardEnv: Environment) => Promise<GuardActionNode | undefined>;
  evaluateGuardReplacement?: (
    action: GuardActionNode | undefined,
    guardEnv: Environment,
    guard: GuardDefinition,
    inputVariable: Variable,
    dependencies: PostGuardReplacementDependencies
  ) => Promise<Variable | undefined>;
  buildDecisionMetadata?: (
    action: GuardActionNode,
    guard: GuardDefinition,
    extras?: BuildPostDecisionMetadataExtras
  ) => Record<string, unknown>;
  defaultGuardMax?: number;
}

export async function evaluatePostGuardRuntime(
  options: EvaluatePostGuardRuntimeOptions,
  dependencies: EvaluatePostGuardRuntimeDependencies
): Promise<GuardResult> {
  const { env, guard, operation, scope } = options;
  const guardEnv = env.createChild();
  dependencies.prepareGuardEnvironment(env, guardEnv, guard);

  let inputVariable: Variable;
  let outputVariable: Variable | undefined;
  let outputValue: unknown;
  let contextLabels: readonly DataLabel[];
  let contextSources: readonly string[];
  let inputPreview: string | null = null;

  if (options.activeInput) {
    inputVariable = dependencies.cloneVariable(options.activeInput);
    outputVariable = options.activeOutput
      ? dependencies.cloneVariable(options.activeOutput)
      : inputVariable;
    outputValue =
      options.outputRaw !== undefined
        ? options.outputRaw
        : dependencies.resolveGuardValue(outputVariable, inputVariable);
    contextLabels =
      options.labelsOverride ??
      (Array.isArray(options.activeInput.mx?.labels) ? options.activeInput.mx.labels : []);
    contextSources =
      options.sourcesOverride ??
      (Array.isArray(options.activeInput.mx?.sources) ? options.activeInput.mx.sources : []);
    inputPreview = options.inputPreviewOverride ?? dependencies.buildVariablePreview(inputVariable);
  } else if (scope === 'perInput' && options.perInput) {
    inputVariable = dependencies.cloneVariable(options.perInput.variable);
    outputVariable = options.activeOutput
      ? dependencies.cloneVariable(options.activeOutput)
      : inputVariable;
    outputValue =
      options.outputRaw ?? dependencies.resolveGuardValue(outputVariable, inputVariable);
    contextLabels = options.labelsOverride ?? options.perInput.labels;
    contextSources = options.sourcesOverride ?? options.perInput.sources;
    inputPreview = options.inputPreviewOverride ?? dependencies.buildVariablePreview(inputVariable);
  } else if (scope === 'perOperation' && options.operationSnapshot) {
    const inputSnapshot = options.operationInputSnapshot ?? options.operationSnapshot;
    const arrayValue = inputSnapshot.variables.slice();
    inputVariable = createArrayVariable('input', arrayValue as any[], false, dependencies.guardInputSource, {
      isSystem: true,
      isReserved: true
    });
    attachArrayHelpers(inputVariable as any);
    contextLabels = options.labelsOverride ?? options.operationSnapshot.labels;
    contextSources = options.sourcesOverride ?? options.operationSnapshot.sources;
    outputVariable = options.activeOutput
      ? dependencies.cloneVariable(options.activeOutput)
      : options.operationSnapshot.variables[0]
        ? dependencies.cloneVariable(options.operationSnapshot.variables[0]!)
      : undefined;
    outputValue =
      options.outputRaw ?? dependencies.resolveGuardValue(outputVariable, inputVariable);
    inputPreview =
      options.inputPreviewOverride ?? `Array(len=${inputSnapshot.variables.length})`;
  } else {
    return { guardName: guard.name ?? null, decision: 'allow', timing: 'after' };
  }

  guardEnv.setVariable('input', inputVariable);
  const outputText =
    typeof outputValue === 'string'
      ? outputValue
      : outputValue === undefined || outputValue === null
        ? ''
        : String(outputValue);
  const guardOutputVariable = createSimpleTextVariable(
    'output',
    outputText as any,
    dependencies.guardInputSource,
    { security: makeSecurityDescriptor({ labels: contextLabels, sources: contextSources }) }
  );
  guardEnv.setVariable('output', guardOutputVariable);
  if (options.inputHelper) {
    dependencies.attachGuardInputHelper(inputVariable, options.inputHelper);
  }

  dependencies.injectGuardHelpers(guardEnv, {
    operation,
    labels: contextLabels,
    operationLabels: operation.opLabels ?? []
  });

  const attemptNumber =
    typeof options.attemptNumber === 'number' && options.attemptNumber > 0
      ? options.attemptNumber
      : 1;
  const attemptHistory = Array.isArray(options.attemptHistory) ? options.attemptHistory : [];
  const hintHistory = Array.isArray(options.hintHistory)
    ? options.hintHistory.map(value =>
        typeof value === 'string' || value === null ? value : String(value ?? '')
      )
    : attemptHistory.map(entry =>
        typeof entry.hint === 'string' || entry.hint === null ? entry.hint : null
      );
  const maxAttempts =
    typeof options.maxAttempts === 'number' && options.maxAttempts > 0
      ? options.maxAttempts
      : (dependencies.defaultGuardMax ?? DEFAULT_GUARD_MAX);

  const guardContext: GuardContextSnapshot = {
    name: guard.name,
    attempt: attemptNumber,
    try: attemptNumber,
    tries: attemptHistory.map(entry => ({ ...entry })),
    max: maxAttempts,
    input: inputVariable,
    output: guardOutputVariable,
    labels: contextLabels,
    sources: contextSources,
    inputPreview,
    outputPreview: dependencies.buildVariablePreview(guardOutputVariable),
    hintHistory,
    timing: 'after'
  } as GuardContextSnapshot;

  const contextSnapshotForMetadata = { ...guardContext };

  const evaluateGuardBlockFn = dependencies.evaluateGuardBlock ?? evaluatePostGuardBlock;
  const action = await env.withGuardContext(guardContext, async () => {
    return await evaluateGuardBlockFn(guard.block, guardEnv);
  });

  const metadataBase: Record<string, unknown> = {
    guardName: guard.name ?? null,
    guardFilter: `${guard.filterKind}:${guard.filterValue}`,
    scope,
    inputPreview,
    guardContext: contextSnapshotForMetadata,
    guardInput: inputVariable,
    timing: 'after'
  };

  if (!action || action.decision === 'allow') {
    const labelModifications = extractGuardLabelModifications(action);
    const allowHint =
      action?.warning
        ? { guardName: guard.name ?? null, hint: action.warning, severity: 'warn' }
        : undefined;
    const evaluateGuardReplacementFn =
      dependencies.evaluateGuardReplacement ?? evaluatePostGuardReplacement;
    const replacement = await env.withGuardContext(guardContext, async () =>
      evaluateGuardReplacementFn(
        action,
        guardEnv,
        guard,
        inputVariable,
        dependencies.replacementDependencies
      )
    );
    return {
      guardName: guard.name ?? null,
      decision: 'allow',
      timing: 'after',
      replacement,
      hint: allowHint,
      labelModifications,
      metadata: metadataBase
    };
  }

  if (action.decision === 'env') {
    const location = astLocationToSourceLocation(action.location, guardEnv.getCurrentFilePath());
    throw new MlldWhenExpressionError(
      'Guard env actions apply only before execution',
      location,
      location?.filePath
        ? { filePath: location.filePath, sourceContent: guardEnv.getSource(location.filePath) }
        : undefined,
      { env: guardEnv }
    );
  }

  const buildDecisionMetadataFn =
    dependencies.buildDecisionMetadata ?? buildPostDecisionMetadata;
  const metadata = buildDecisionMetadataFn(action, guard, {
    inputPreview,
    inputVariable,
    contextSnapshot: contextSnapshotForMetadata
  });

  if (action.decision === 'deny') {
    return {
      guardName: guard.name ?? null,
      decision: 'deny',
      timing: 'after',
      reason: metadata.reason as string | undefined,
      metadata
    };
  }

  if (action.decision === 'retry') {
    return {
      guardName: guard.name ?? null,
      decision: 'retry',
      timing: 'after',
      reason: metadata.reason as string | undefined,
      hint: action.message ? { guardName: guard.name ?? null, hint: action.message } : undefined,
      metadata
    };
  }

  return { guardName: guard.name ?? null, decision: 'allow', timing: 'after', metadata };
}
