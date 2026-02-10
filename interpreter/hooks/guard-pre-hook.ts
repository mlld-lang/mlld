import type { GuardDefinition, GuardScope } from '../guards';
import type { Environment } from '../env/Environment';
import type { OperationContext, GuardContextSnapshot } from '../env/ContextManager';
import type { HookDecision, PreHook } from './HookManager';
import type {
  GuardBlockNode,
  GuardActionNode,
  GuardDecisionType,
  GuardHint,
  GuardResult
} from '@core/types/guard';
import { astLocationToSourceLocation } from '@core/types';
import type { Variable, VariableSource } from '@core/types/variable';
import { createArrayVariable, createSimpleTextVariable } from '@core/types/variable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable } from '@core/types/executable';
import { attachArrayHelpers } from '@core/types/variable/ArrayHelpers';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { DataLabel } from '@core/types/security';
import { evaluateCondition } from '../eval/when';
import { isLetAssignment, isAugmentedAssignment } from '@core/types/when';
import {
  guardSnapshotDescriptor,
  applyGuardLabelModifications,
  extractGuardLabelModifications,
  logGuardLabelModifications
} from './guard-utils';
import { VariableImporter } from '../eval/import/VariableImporter';
import { evaluate } from '../core/interpreter';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { combineValues } from '../utils/value-combine';
import { MlldWhenExpressionError, MlldSecurityError } from '@core/errors';
import { interpreterLogger } from '@core/utils/logger';
import type { HookableNode } from '@core/types/hooks';
import { isDirectiveHookTarget, isEffectHookTarget } from '@core/types/hooks';
import { materializeGuardInputs } from '../utils/guard-inputs';
import { varMxToSecurityDescriptor, updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { materializeGuardTransform } from '../utils/guard-transform';
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
import {
  buildOperationKeySet,
  buildOperationSnapshot,
  type OperationSnapshot
} from './guard-operation-keys';
import {
  applyGuardDecisionResult,
  createGuardDecisionState,
  shouldClearAttemptState,
  toHookAction
} from './guard-decision-reducer';
import {
  buildGuardAttemptKey,
  clearGuardAttemptStates,
  getAttemptStore,
  type GuardAttemptEntry,
  type GuardAttemptState
} from './guard-retry-state';
import { appendFileSync } from 'fs';
import { getExpressionProvenance } from '../utils/expression-provenance';
import { isStructuredValue } from '../utils/structured-value';

type GuardHelperImplementation = (args: readonly unknown[]) => unknown | Promise<unknown>;

const DEFAULT_GUARD_MAX = 3;

const GUARD_INPUT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

const GUARD_HELPER_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'code',
  hasInterpolation: false,
  isMultiLine: false
};

const GUARD_DEBUG_PREVIEW_LIMIT = 100;

function isGuardDebugEnabled(): boolean {
  const value = process.env.MLLD_DEBUG_GUARDS;
  if (!value) {
    return false;
  }
  return value === '1' || value.toLowerCase() === 'true';
}

function logGuardDebug(message: string, context?: Record<string, unknown>): void {
  if (!isGuardDebugEnabled()) {
    return;
  }
  ensureGuardLoggerLevel();
  interpreterLogger.debug(message, context);
}

let guardLoggerPrimed = false;
function ensureGuardLoggerLevel(): void {
  if (guardLoggerPrimed) {
    return;
  }
  guardLoggerPrimed = true;
  try {
    interpreterLogger.level = 'debug';
  } catch {
    // Ignore logger level adjustments in restricted environments
  }
}

function formatGuardLabel(guard: GuardDefinition): string {
  const label = guard.name ?? 'anonymous';
  const filter = `${guard.filterKind}:${guard.filterValue}`;
  return `${label} (for ${filter})`;
}

function formatOperationDescription(operation?: OperationContext): string {
  if (!operation || !operation.type) {
    return 'operation';
  }
  const base = operation.type.startsWith('/') ? operation.type : `/${operation.type}`;
  const subtype = operation.subtype ? ` (${operation.subtype})` : '';
  return `${base}${subtype}`;
}

function sanitizePreviewForLog(preview?: string | null): string | null {
  if (!preview) {
    return null;
  }
  if (preview.length <= GUARD_DEBUG_PREVIEW_LIMIT) {
    return preview;
  }
  return `${preview.slice(0, GUARD_DEBUG_PREVIEW_LIMIT)}…`;
}

function logGuardEvaluationStart(options: {
  guard: GuardDefinition;
  node: HookableNode;
  operation: OperationContext;
  scope: GuardScope;
  attempt: number;
  inputPreview?: string | null;
}): void {
  const operationDescription = formatOperationDescription(options.operation);
  logGuardDebug(
    `Guard ${formatGuardLabel(options.guard)} evaluating ${operationDescription}`,
    {
      guard: options.guard.name ?? null,
      filter: `${options.guard.filterKind}:${options.guard.filterValue}`,
      target: describeHookTarget(options.node),
      operationType: options.operation.type ?? null,
      operationSubtype: options.operation.subtype ?? null,
      scope: options.scope,
      attempt: options.attempt,
      inputPreview: sanitizePreviewForLog(options.inputPreview)
    }
  );
}

function logGuardDecisionEvent(options: {
  guard: GuardDefinition;
  node: HookableNode;
  operation: OperationContext;
  scope: GuardScope;
  attempt: number;
  decision: GuardDecisionType;
  reason?: string | null;
  hint?: string | null;
  inputPreview?: string | null;
}): void {
  const reason = options.reason ?? options.hint ?? 'No reason provided';
  const operationDescription = formatOperationDescription(options.operation);
  logGuardDebug(
    `Guard decision: ${options.decision} (${reason}) on ${operationDescription}`,
    {
      guard: options.guard.name ?? null,
      filter: `${options.guard.filterKind}:${options.guard.filterValue}`,
      target: describeHookTarget(options.node),
      operationType: options.operation.type ?? null,
      scope: options.scope,
      attempt: options.attempt,
      hint: options.hint ?? null,
      inputPreview: sanitizePreviewForLog(options.inputPreview)
    }
  );
  if (options.decision === 'retry') {
    logGuardDebug(
      `Guard retry attempt ${options.attempt} for ${formatGuardLabel(options.guard)}`,
      {
        guard: options.guard.name ?? null,
        filter: `${options.guard.filterKind}:${options.guard.filterValue}`,
        operationType: options.operation.type ?? null,
        hint: options.hint ?? null
      }
    );
  }
}

function describeHookTarget(node: HookableNode): string {
  if (isDirectiveHookTarget(node)) {
    return node.kind;
  }
  if (isEffectHookTarget(node)) {
    return `effect:${(node as any).rawIdentifier ?? 'unknown'}`;
  }
  return 'exe';
}

function truncatePreview(value: string, limit = 160): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
}

function hasSecretLabel(variable: Variable): boolean {
  const labels = Array.isArray(variable.mx?.labels) ? variable.mx!.labels : [];
  return labels.includes('secret') || labels.includes('sensitive');
}

function hasSecretLabelInArray(labels: readonly DataLabel[]): boolean {
  return labels.includes('secret') || labels.includes('sensitive');
}

function redactVariableForErrorOutput(variable: Variable): string {
  return '[REDACTED]';
}

function buildVariablePreview(variable: Variable): string | null {
  if (hasSecretLabel(variable)) {
    return '[REDACTED]';
  }
  try {
    const value = (variable as any).value;
    if (typeof value === 'string') {
      return truncatePreview(value);
    }
    if (value && typeof value === 'object') {
      if (typeof (value as any).text === 'string') {
        return truncatePreview((value as any).text);
      }
      return truncatePreview(JSON.stringify(value));
    }
    if (value === null || value === undefined) {
      return null;
    }
    return truncatePreview(String(value));
  } catch {
    return null;
  }
}

function buildInputPreview(
  scope: GuardScope,
  perInput?: PerInputCandidate,
  operationSnapshot?: OperationSnapshot
): string | null {
  if (scope === 'perInput' && perInput) {
    if (hasSecretLabelInArray(perInput.labels)) {
      return '[REDACTED]';
    }
    return buildVariablePreview(perInput.variable);
  }
  if (scope === 'perOperation' && operationSnapshot) {
    return `Array(len=${operationSnapshot.variables.length})`;
  }
  return null;
}

export const guardPreHook: PreHook = async (
  node,
  inputs,
  env,
  operation,
  helpers
): Promise<HookDecision> => {
  if (!operation || (isDirectiveHookTarget(node) && node.kind === 'guard')) {
    return { action: 'continue' };
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

    if (process.env.MLLD_DEBUG_GUARDS === '1' && operation?.name === 'emit') {
      try {
        const names = Array.from(env.getAllVariables().keys()).slice(0, 50);
        interpreterLogger.debug('guard-pre debug emit context', {
          parentHasPrefix: env.hasVariable('prefixWith'),
          names
        });
      } catch {
        // ignore debug failures
      }
    }
    const registry = env.getGuardRegistry();
    const variableInputs = materializeGuardInputs(inputs, { nameHint: '__guard_input__' });

    const perInputCandidates = buildPerInputCandidates(registry, variableInputs, guardOverride);
    const operationGuards = collectOperationGuards(registry, operation, guardOverride);

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
        const result = await evaluateGuard({
          node,
          env,
          guard,
          operation,
          scope: 'perInput',
          perInput: candidate,
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
        const result = await evaluateGuard({
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

    if (process.env.MLLD_DEBUG_GUARDS === '1') {
      try {
        const inputPreview = Array.isArray(inputs)
          ? inputs
              .slice(0, 3)
              .map(entry =>
                isVariable(entry as any)
                  ? {
                      name: (entry as any).name,
                      text: (entry as any).value?.text ?? (entry as any).text ?? (entry as any).value,
                      labels: (entry as any).mx?.labels
                    }
                  : entry
              )
          : inputs;
        console.error('[guard-pre-hook] decision', {
          decision: decisionState.decision,
          operation: {
            type: operation?.type,
            subtype: operation?.subtype,
            name: operation?.name,
            labels: operation?.labels,
            metadata: operation?.metadata
          },
          inputs: inputPreview,
          reasons: decisionState.reasons,
          hints: decisionState.hints.map(h => (typeof h === 'string' ? h : h?.hint ?? h)),
          guardTrace: guardTrace.map(trace => ({
            guard: trace.guard?.name ?? trace.guard?.filterKind,
            decision: trace.decision,
            reason: trace.reason,
            hint: trace.hint
          }))
        });
        try {
          appendFileSync(
            '/tmp/mlld_guard_pre.log',
            JSON.stringify(
              {
                decision: decisionState.decision,
                operation: {
                  type: operation?.type,
                  subtype: operation?.subtype,
                  name: operation?.name,
                  labels: operation?.labels,
                  metadata: operation?.metadata
                },
                reasons: decisionState.reasons,
                hints: decisionState.hints.map(h => (typeof h === 'string' ? h : h?.hint ?? h)),
                guardTrace: guardTrace.map(trace => ({
                  guard: trace.guard?.name ?? trace.guard?.filterKind,
                  decision: trace.decision,
                  reason: trace.reason,
                  hint: trace.hint
                }))
              },
              null,
              2
            ) + '\n'
          );
        } catch {
          // ignore file debug failures
        }
      } catch {
        // ignore debug logging failures
      }
    }

    if (shouldClearAttemptState(decisionState.decision)) {
      clearGuardAttemptStates(attemptStore, usedAttemptKeys);
    }

    return {
      action: toHookAction(decisionState.decision),
      metadata: aggregateMetadata
    };
  });
};

async function evaluateGuard(options: {
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
}): Promise<GuardResult> {
  const { env, guard, operation, scope } = options;
  const guardEnv = env.createChild();
  inheritParentVariables(env, guardEnv);
  if (process.env.MLLD_DEBUG_GUARDS === '1' && (guard.name === 'prep' || guard.name === 'tagOutput')) {
    try {
      console.error('[guard-pre-hook] prefixWith availability', {
        envHas: env.hasVariable('prefixWith'),
        childHas: guardEnv.hasVariable('prefixWith'),
        envHasEmit: env.hasVariable('emit'),
        envHasTag: env.hasVariable('tagValue'),
        childHasTag: guardEnv.hasVariable('tagValue')
      });
    } catch {
      // ignore debug
    }
  }
  ensurePrefixHelper(env, guardEnv);
  ensureTagHelper(env, guardEnv);

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
    inputVariable = createArrayVariable('input', arrayValue as any[], false, GUARD_INPUT_SOURCE, {
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
    GUARD_INPUT_SOURCE,
    { security: makeSecurityDescriptor({ labels: contextLabels, sources: contextSources }) }
  );

  guardEnv.setVariable('input', inputVariable);
  guardEnv.setVariable('output', guardOutputVariable);
  if (options.inputHelper) {
    attachGuardHelper(inputVariable, options.inputHelper);
  }

  injectGuardHelpers(guardEnv, {
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
    max: DEFAULT_GUARD_MAX,
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

  logGuardEvaluationStart({
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
      logGuardDecisionEvent({
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
    return await evaluateGuardBlock(guard.block, guardEnv);
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
    const labelModifications = extractGuardLabelModifications(action);
    const allowHint =
      action?.warning
        ? { guardName: guard.name ?? null, hint: action.warning, severity: 'warn' }
        : undefined;
    const replacement = await env.withGuardContext(guardContext, async () =>
      evaluateGuardReplacement(action, guardEnv, guard, inputVariable)
    );
    return {
      guardName: guard.name ?? null,
      decision: 'allow',
      timing: 'before',
      replacement,
      hint: allowHint,
      labelModifications,
      metadata: metadataBase
    };
  }

  if (action.decision === 'env') {
    const envConfig = await resolveGuardEnvConfig(action, guardEnv);
    const metadata = {
      ...metadataBase,
      decision: 'env',
      envConfig
    };
    logGuardDecisionEvent({
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

  const metadata = buildDecisionMetadata(action, guard, {
    inputPreview,
    attempt: options.attemptNumber,
    tries: options.attemptHistory,
    inputVariable,
    contextSnapshot: contextSnapshotForMetadata
  });

  logGuardDecisionEvent({
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
    const retryMetadata = buildDecisionMetadata(action, guard, {
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

async function evaluateGuardBlock(
  block: GuardBlockNode,
  guardEnv: Environment
): Promise<GuardActionNode | undefined> {
  // Create a child environment for let scoping
  let currentEnv = guardEnv;

  for (const entry of block.rules) {
    // Handle let assignments
    if (isLetAssignment(entry)) {
      let value: unknown;
      // Check if value is a raw primitive or contains nodes
      const firstValue = Array.isArray(entry.value) && entry.value.length > 0 ? entry.value[0] : entry.value;
      const isRawPrimitive = firstValue === null ||
        typeof firstValue === 'number' ||
        typeof firstValue === 'boolean' ||
        (typeof firstValue === 'string' && !('type' in (firstValue as any)));

      if (isRawPrimitive) {
        value = (entry.value as any[]).length === 1 ? firstValue : entry.value;
      } else {
        const valueResult = await evaluate(entry.value, currentEnv);
        value = valueResult.value;
      }

      const importer = new VariableImporter();
      const variable = importer.createVariableFromValue(
        entry.identifier,
        value,
        'let',
        undefined,
        { env: currentEnv }
      );
      currentEnv = currentEnv.createChild();
      currentEnv.setVariable(entry.identifier, variable);
      continue;
    }

    // Handle augmented assignments
    if (isAugmentedAssignment(entry)) {
      const existing = currentEnv.getVariable(entry.identifier);
      if (!existing) {
        const location = astLocationToSourceLocation(entry.location, currentEnv.getCurrentFilePath());
        throw new MlldWhenExpressionError(
          `Cannot use += on undefined variable @${entry.identifier}. ` +
          `Use "let @${entry.identifier} = ..." first.`,
          location,
          location?.filePath ? { filePath: location.filePath, sourceContent: currentEnv.getSource(location.filePath) } : undefined,
          { env: currentEnv }
        );
      }

      let rhsValue: unknown;
      const firstValue = Array.isArray(entry.value) && entry.value.length > 0 ? entry.value[0] : entry.value;
      const isRawPrimitive = firstValue === null ||
        typeof firstValue === 'number' ||
        typeof firstValue === 'boolean' ||
        (typeof firstValue === 'string' && !('type' in (firstValue as any)));

      if (isRawPrimitive) {
        rhsValue = (entry.value as any[]).length === 1 ? firstValue : entry.value;
      } else {
        const rhsResult = await evaluate(entry.value, currentEnv);
        rhsValue = rhsResult.value;
      }

      const existingValue = await extractVariableValue(existing, currentEnv);
      const combined = combineValues(existingValue, rhsValue, entry.identifier);

      const importer = new VariableImporter();
      const updatedVar = importer.createVariableFromValue(
        entry.identifier,
        combined,
        'let',
        undefined,
        { env: currentEnv }
      );
      currentEnv.updateVariable(entry.identifier, updatedVar);
      continue;
    }

    // Handle guard rules
    const rule = entry;
    let matches = false;
    if (rule.isWildcard) {
      matches = true;
    } else if (rule.condition && rule.condition.length > 0) {
      matches = await evaluateCondition(rule.condition, currentEnv);
    }

    if (matches) {
      return rule.action;
    }
  }
  return undefined;
}

async function evaluateGuardReplacement(
  action: GuardActionNode | undefined,
  guardEnv: Environment,
  guard: GuardDefinition,
  inputVariable: Variable
): Promise<Variable | undefined> {
  if (!action || action.decision !== 'allow') {
    return undefined;
  }
  const { evaluate } = await import('../core/interpreter');
  const labelModifications = extractGuardLabelModifications(action);
  const baseDescriptor = inputVariable.mx
    ? varMxToSecurityDescriptor(inputVariable.mx)
    : makeSecurityDescriptor();
  const modifiedDescriptor = applyGuardLabelModifications(
    baseDescriptor,
    labelModifications,
    guard
  );
  const guardLabel = guard.name ?? guard.filterValue ?? 'guard';
  await logGuardLabelModifications(guardEnv, guard, labelModifications, [inputVariable]);

  if (action.value && action.value.length > 0) {
    const result = await evaluate(action.value, guardEnv, {
      privileged: guard.privileged === true
    });
    return materializeGuardTransform(result?.value ?? result, guardLabel, modifiedDescriptor);
  }

  if (!labelModifications) {
    return undefined;
  }

  const guardDescriptor = mergeDescriptors(
    modifiedDescriptor,
    makeSecurityDescriptor({ sources: [`guard:${guardLabel}`] })
  );
  return cloneVariableForReplacement(inputVariable, guardDescriptor);
}

async function resolveGuardEnvConfig(
  action: GuardActionNode,
  guardEnv: Environment
): Promise<unknown> {
  if (!action.value || action.value.length === 0) {
    const location = astLocationToSourceLocation(action.location, guardEnv.getCurrentFilePath());
    throw new MlldWhenExpressionError(
      'Guard env actions require a config value: env @config',
      location,
      location?.filePath ? { filePath: location.filePath, sourceContent: guardEnv.getSource(location.filePath) } : undefined,
      { env: guardEnv }
    );
  }
  const result = await evaluate(action.value, guardEnv, { isExpression: true });
  let value = result.value;
  if (isVariable(value as Variable)) {
    value = await extractVariableValue(value as Variable, guardEnv);
  }
  if (isStructuredValue(value)) {
    return value.data;
  }
  return value;
}

function buildDecisionMetadata(
  action: GuardActionNode,
  guard: GuardDefinition,
  extras?: {
    hint?: string | null;
    inputPreview?: string | null;
    attempt?: number;
    tries?: GuardAttemptEntry[];
    inputVariable?: Variable;
    contextSnapshot?: GuardContextSnapshot;
  }
): Record<string, unknown> {
  const guardId = guard.name ?? `${guard.filterKind}:${guard.filterValue}`;
  const reason =
    action.message ??
    (action.decision === 'deny'
      ? `Guard ${guardId} denied operation`
      : `Guard ${guardId} requested retry`);

  const metadata: Record<string, unknown> = {
    reason,
    guardName: guard.name ?? null,
    guardFilter: `${guard.filterKind}:${guard.filterValue}`,
    scope: guard.scope,
    decision: action.decision
  };

  if (extras?.hint !== undefined) {
    metadata.hint = extras.hint;
  }

  if (extras?.inputPreview !== undefined) {
    metadata.inputPreview = extras.inputPreview;
  }

  if (extras?.attempt !== undefined) {
    metadata.attempt = extras.attempt;
  }

  if (extras?.tries) {
    metadata.tries = extras.tries.map(entry => ({
      attempt: entry.attempt,
      decision: entry.decision,
      hint: entry.hint ?? null
    }));
  }

  if (extras?.inputVariable) {
    metadata.guardInput = hasSecretLabel(extras.inputVariable)
      ? redactVariableForErrorOutput(extras.inputVariable)
      : extras.inputVariable;
  }

  if (extras?.contextSnapshot) {
    metadata.guardContext = extras.contextSnapshot;
  }

  return metadata;
}

function inheritParentVariables(parent: Environment, child: Environment): void {
  const aggregated = new Map<string, Variable>();
  const addVars = (env: Environment) => {
    for (const [name, variable] of env.getAllVariables()) {
      if (!aggregated.has(name)) {
        aggregated.set(name, variable);
      }
    }
  };

  let current: Environment | undefined = parent;
  while (current) {
    addVars(current);
    current = current.getParent();
  }

  for (const [name, variable] of aggregated) {
    if (!child.hasVariable(name)) {
      child.setVariable(name, variable);
    }
  }
}

function cloneVariableForGuard(variable: Variable): Variable {
  const clone: Variable = {
    ...variable,
    name: 'input',
    mx: {
      ...(variable.mx ?? {})
    },
    internal: {
      ...(variable.internal ?? {}),
      isReserved: true,
      isSystem: true
    }
  };
  if (clone.mx?.mxCache) {
    delete clone.mx.mxCache;
  }
  return clone;
}

function cloneVariableForReplacement(
  variable: Variable,
  descriptor: SecurityDescriptor
): Variable {
  const clone: Variable = {
    ...variable,
    mx: {
      ...(variable.mx ?? {})
    },
    internal: {
      ...(variable.internal ?? {})
    }
  };
  if (!clone.mx) {
    clone.mx = {} as any;
  }
  updateVarMxFromDescriptor(clone.mx, descriptor);
  if (clone.mx?.mxCache) {
    delete clone.mx.mxCache;
  }
  return clone;
}

function cloneGuardContextSnapshot(context: GuardContextSnapshot): GuardContextSnapshot {
  const cloned: GuardContextSnapshot = {
    ...context,
    tries: context.tries ? context.tries.map(entry => ({ ...entry })) : undefined,
    labels: context.labels ? [...context.labels] : undefined,
    sources: context.sources ? [...context.sources] : undefined,
    hintHistory: context.hintHistory ? [...context.hintHistory] : undefined
  };
  if (context.input !== undefined) {
    cloned.input = redactOrCloneGuardContextInput(context.input);
  }
  if (context.output !== undefined) {
    cloned.output = redactOrCloneGuardContextInput(context.output as any);
  }
  if (cloned.inputPreview !== undefined && typeof cloned.inputPreview === 'string') {
    const labels = Array.isArray(context.labels) ? context.labels : [];
    if (hasSecretLabelInArray(labels)) {
      cloned.inputPreview = '[REDACTED]';
    }
  }
  if (cloned.outputPreview !== undefined && typeof cloned.outputPreview === 'string') {
    const labels = Array.isArray(context.labels) ? context.labels : [];
    if (hasSecretLabelInArray(labels)) {
      cloned.outputPreview = '[REDACTED]';
    }
  }
  return cloned;
}

function redactOrCloneGuardContextInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => {
      if (isVariable(item) && hasSecretLabel(item)) {
        return redactVariableForErrorOutput(item);
      }
      return isVariable(item) ? cloneVariableForGuard(item) : item;
    });
  }
  if (isVariable(value as Variable)) {
    if (hasSecretLabel(value as Variable)) {
      return redactVariableForErrorOutput(value as Variable);
    }
    return cloneVariableForGuard(value as Variable);
  }
  return value;
}

function injectGuardHelpers(
  guardEnv: Environment,
  options: {
    operation: OperationContext;
    labels: readonly DataLabel[];
    operationLabels: readonly string[];
  }
): void {
  const opKeys = buildOperationKeySet(options.operation);
  const opLabels = new Set(options.operationLabels.map(label => label.toLowerCase()));
  const inputLabels = new Set(options.labels.map(label => label.toLowerCase()));

  const helperVariables: ExecutableVariable[] = [
    createGuardHelperExecutable('opIs', ([target]) => {
      if (typeof target !== 'string') return false;
      return opKeys.has(target.toLowerCase());
    }),
    createGuardHelperExecutable('opHas', ([label]) => {
      if (typeof label !== 'string') return false;
      return opLabels.has(label.toLowerCase());
    }),
    createGuardHelperExecutable('opHasAny', ([value]) => {
      const labels = Array.isArray(value) ? value : [value];
      return labels.some(item => typeof item === 'string' && opLabels.has(item.toLowerCase()));
    }),
    createGuardHelperExecutable('opHasAll', ([value]) => {
      const labels = Array.isArray(value) ? value : [value];
      if (labels.length === 0) {
        return false;
      }
      return labels.every(item => typeof item === 'string' && opLabels.has(item.toLowerCase()));
    }),
    createGuardHelperExecutable('inputHas', ([label]) => {
      if (typeof label !== 'string') return false;
      return inputLabels.has(label.toLowerCase());
    })
  ];

  for (const variable of helperVariables) {
    guardEnv.setVariable(variable.name, variable);
  }
}

function createGuardHelperExecutable(
  name: string,
  implementation: GuardHelperImplementation
): ExecutableVariable {
  const execVar = createExecutableVariable(
    name,
    'code',
    '',
    [],
    'javascript',
    GUARD_HELPER_SOURCE,
    {
      mx: {},
      internal: { isSystem: true }
    }
  );
  execVar.internal = {
    ...(execVar.internal ?? {}),
    executableDef: execVar.value,
    isGuardHelper: true,
    guardHelperImplementation: implementation
  };
  return execVar;
}

function ensurePrefixHelper(sourceEnv: Environment, targetEnv: Environment): void {
  const execVar = createGuardHelperExecutable('prefixWith', ([label, value]) => {
    const normalize = (candidate: unknown, fallback: Variable | undefined) => {
      if (isVariable(candidate as Variable)) {
        return resolveGuardValue(candidate as Variable, (candidate as Variable) ?? fallback ?? (label as Variable));
      }
      if (Array.isArray(candidate)) {
        const [head] = candidate;
        if (head !== undefined) {
          return normalize(head, head as Variable);
        }
        return '';
      }
      if (candidate && typeof candidate === 'object') {
        const asObj = candidate as any;
        if (typeof asObj.text === 'string') {
          return asObj.text;
        }
        if (typeof asObj.data === 'string') {
          return asObj.data;
        }
      }
      return candidate;
    };

    if (process.env.MLLD_DEBUG_GUARDS === '1') {
      try {
        console.error('[guard-prefixWith]', {
          labelType: typeof label,
          valueType: typeof value,
          labelKeys: label && typeof label === 'object' ? Object.keys(label as any) : null,
          valueKeys: value && typeof value === 'object' ? Object.keys(value as any) : null
        });
      } catch {
        // ignore debug logging errors
      }
    }

    const normalized = normalize(value, value as Variable);
    const normalizedLabel = normalize(label, label as Variable);
    return `${normalizedLabel}:${normalized}`;
  });
  targetEnv.setVariable(execVar.name, execVar);
}

function ensureTagHelper(sourceEnv: Environment, targetEnv: Environment): void {
  if (targetEnv.hasVariable('tagValue')) {
    return;
  }
  const existing = sourceEnv.getVariable('tagValue');
  if (existing) {
    targetEnv.setVariable('tagValue', existing);
    return;
  }
  const execVar = createGuardHelperExecutable('tagValue', ([timing, value, input]) => {
    const normalize = (candidate: unknown): unknown => {
      if (isVariable(candidate as Variable)) {
        return resolveGuardValue(candidate as Variable, candidate as Variable);
      }
      if (Array.isArray(candidate)) {
        const [head] = candidate;
        return head !== undefined ? normalize(head) : '';
      }
      if (candidate && typeof candidate === 'object') {
        const asObj = candidate as any;
        if (typeof asObj.text === 'string') {
          return asObj.text;
        }
        if (typeof asObj.data === 'string') {
          return asObj.data;
        }
      }
      return candidate;
    };
    const base = normalize(value) ?? normalize(input) ?? '';
    return timing === 'before' ? `before:${base}` : `after:${base}`;
  });
  targetEnv.setVariable(execVar.name, execVar);
}

function buildAggregateMetadata(options: {
  guardResults: GuardResult[];
  reasons?: string[];
  hints?: GuardHint[];
  transformedInputs?: readonly Variable[];
  primaryMetadata?: Record<string, unknown> | undefined;
  guardContext?: GuardContextSnapshot;
  envConfig?: unknown;
  envGuard?: string | null;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    guardResults: options.guardResults,
    reasons: options.reasons ?? [],
    hints: options.hints ?? []
  };

  if (options.transformedInputs) {
    metadata.transformedInputs = options.transformedInputs;
  }

  if (options.primaryMetadata) {
    Object.assign(metadata, options.primaryMetadata);
  }

  if (options.guardContext) {
    metadata.guardContext = options.guardContext;
  }

  if (options.envConfig !== undefined) {
    metadata.envConfig = options.envConfig;
    if (options.envGuard !== undefined) {
      metadata.envGuard = options.envGuard;
    }
  }

  if (!metadata.reason && options.reasons && options.reasons.length > 0) {
    metadata.reason = options.reasons[0];
  }

  return metadata;
}

function buildAggregateGuardContext(options: {
  decision: 'allow' | 'deny' | 'retry';
  guardResults: GuardResult[];
  hints: GuardHint[];
  reasons: string[];
  primaryMetadata?: Record<string, unknown>;
}): GuardContextSnapshot {
  const baseContext =
    (options.primaryMetadata?.guardContext as GuardContextSnapshot | undefined) ?? {};
  const attempt =
    typeof baseContext.attempt === 'number'
      ? baseContext.attempt
      : typeof baseContext.try === 'number'
        ? baseContext.try ?? 0
        : 0;
  return {
    ...baseContext,
    attempt,
    try: typeof baseContext.try === 'number' ? baseContext.try : attempt,
    max: typeof baseContext.max === 'number' ? baseContext.max : DEFAULT_GUARD_MAX,
    trace: options.guardResults.slice(),
    hints: options.hints.slice(),
    reasons: options.reasons.slice(),
    reason: baseContext.reason ?? options.reasons[0] ?? null,
    decision: options.decision
  };
}

function resolveGuardValue(variable: Variable | undefined, fallback: Variable): unknown {
  const candidate = (variable as any)?.value ?? (fallback as any)?.value ?? variable ?? fallback;
  if (candidate && typeof candidate === 'object') {
    if (typeof (candidate as any).text === 'string') {
      return (candidate as any).text;
    }
    if (typeof (candidate as any).data === 'string') {
      return (candidate as any).data;
    }
  }
  if (candidate === undefined || candidate === null) {
    return buildVariablePreview(fallback) ?? '';
  }
  return candidate;
}

function normalizeGuardReplacements(value: unknown): Variable[] {
  if (isVariable(value as Variable)) {
    return [value as Variable];
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).filter(item => isVariable(item as Variable)) as Variable[];
  }
  return [];
}

function attachGuardHelper(target: Variable, helper: GuardInputHelper): void {
  const apply = (key: string, value: unknown) => {
    Object.defineProperty(target as any, key, {
      value,
      enumerable: false,
      configurable: true,
      writable: false
    });
  };

  apply('any', helper.any);
  apply('all', helper.all);
  apply('none', helper.none);
  apply('totalTokens', helper.totalTokens);
  apply('maxTokens', helper.maxTokens);
}
