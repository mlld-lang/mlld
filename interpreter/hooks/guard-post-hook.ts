import type { HookableNode } from '@core/types/hooks';
import { astLocationToSourceLocation } from '@core/types';
import type { GuardResult, GuardActionNode, GuardBlockNode, GuardHint } from '@core/types/guard';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import type { Variable, VariableSource } from '@core/types/variable';
import { createArrayVariable, createSimpleTextVariable } from '@core/types/variable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable } from '@core/types/executable';
import {
  attachArrayHelpers,
  buildArrayAggregate,
  createGuardInputHelper
} from '@core/types/variable/ArrayHelpers';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import { varMxToSecurityDescriptor, updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { evaluateCondition } from '../eval/when';
import { isLetAssignment, isAugmentedAssignment } from '@core/types/when';
import { VariableImporter } from '../eval/import/VariableImporter';
import { evaluate } from '../core/interpreter';
import { combineValues } from '../utils/value-combine';
import { MlldWhenExpressionError, MlldSecurityError } from '@core/errors';
import { materializeGuardInputs } from '../utils/guard-inputs';
import { materializeGuardTransform } from '../utils/guard-transform';
import type { PostHook } from './HookManager';
import type { Environment } from '../env/Environment';
import {
  guardSnapshotDescriptor,
  applyGuardLabelModifications,
  extractGuardLabelModifications,
  logGuardLabelModifications
} from './guard-utils';
import type { OperationContext, GuardContextSnapshot } from '../env/ContextManager';
import type { EvalResult } from '../core/interpreter';
import type { GuardDefinition } from '../guards/GuardRegistry';
import { isDirectiveHookTarget } from '@core/types/hooks';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { extractSecurityDescriptor } from '../utils/structured-value';
import {
  type PerInputCandidate,
  buildPerInputCandidates,
  collectOperationGuards
} from './guard-candidate-selection';
import { buildOperationKeys } from './guard-operation-keys';
import {
  extractOutputDescriptor,
  mergeDescriptorWithFallbackInputs
} from './guard-post-descriptor';
import {
  buildTransformedGuardResult,
  normalizeFallbackOutputValue,
  normalizeRawOutput
} from './guard-post-output-normalization';
import { runPostGuardDecisionEngine } from './guard-post-decision-engine';
import { evaluateRetryEnforcement, getGuardRetryContext } from './guard-post-retry';
import {
  buildPostGuardError,
  buildPostRetryDeniedError,
  buildPostGuardRetrySignal
} from './guard-post-signals';
import { extractGuardOverride, normalizeGuardOverride } from './guard-override-utils';
import { appendGuardHistory } from './guard-shared-history';
import { GuardError } from '@core/errors/GuardError';
import { appendFileSync } from 'fs';
import { getExpressionProvenance } from '../utils/expression-provenance';
import { formatGuardWarning } from '../eval/guard-denial-handler';

const afterRetryDebugEnabled = process.env.DEBUG_AFTER_RETRY === '1';

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

interface OperationSnapshot {
  labels: readonly DataLabel[];
  sources: readonly string[];
  variables: readonly Variable[];
}

function logAfterRetryDebug(label: string, payload: Record<string, unknown>): void {
  if (!afterRetryDebugEnabled) {
    return;
  }
  try {
    console.error(`[after-guard-debug] ${label}`, payload);
  } catch {
    // ignore debug failures
  }
}

function summarizeOperation(operation: OperationContext | undefined): Record<string, unknown> {
  if (!operation) {
    return {};
  }
  return {
    type: operation.type,
    subtype: operation.subtype,
    name: operation.name,
    labels: operation.labels,
    metadata: operation.metadata
  };
}

export const guardPostHook: PostHook = async (node, result, inputs, env, operation) => {
  if (!operation || (isDirectiveHookTarget(node) && node.kind === 'guard')) {
    return result;
  }

  if (env.shouldSuppressGuards()) {
    return result;
  }

  return env.withGuardSuppression(async () => {
    if (process.env.MLLD_DEBUG_GUARDS === '1' && operation?.name === 'emit') {
      try {
        const names = Array.from(env.getAllVariables().keys()).slice(0, 50);
        console.error('[guard-post-hook] debug emit context', {
          parentHasPrefix: env.hasVariable('prefixWith'),
          parentHasTag: env.hasVariable('tagValue'),
          names
        });
      } catch {
        // ignore debug failures
      }
    }
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

    if (guardOverride.kind === 'disableAll') {
      const registry = env.getGuardRegistry();
      const hasPrivileged = registry.getAllGuards().some(def => def.privileged === true);
      if (!hasPrivileged) {
        env.emitEffect('stderr', '[Guard Override] All guards disabled for this operation\n');
        return result;
      }
      env.emitEffect('stderr', '[Guard Override] Non-privileged guards disabled for this operation\n');
    }
    const selectionSources: string[] = ['output'];

    const retryContext = getGuardRetryContext(env);
    const registry = env.getGuardRegistry();
    const baseOutputValue = normalizeRawOutput(result.value);
    const outputVariables = materializeGuardInputs([result.value], { nameHint: '__guard_output__' });
    const inputVariables = materializeGuardInputs(inputs ?? [], { nameHint: '__guard_input__' });
    if (outputVariables.length === 0) {
      const fallbackValue = normalizeFallbackOutputValue(baseOutputValue);
      const fallbackOutput = createSimpleTextVariable(
        '__guard_output__',
        fallbackValue as any,
        GUARD_INPUT_SOURCE,
        { security: extractSecurityDescriptor(result.value) ?? makeSecurityDescriptor() }
      );
      outputVariables.push(fallbackOutput);
    }
    let activeOutputs = outputVariables.slice();
    let currentDescriptor = extractOutputDescriptor(result, activeOutputs[0]);

    let perInputCandidates = buildPerInputCandidates(registry, outputVariables, guardOverride, 'after');
    if (perInputCandidates.length === 0 && inputVariables.length > 0) {
      currentDescriptor = mergeDescriptorWithFallbackInputs(currentDescriptor, inputVariables);
      activeOutputs = inputVariables.slice();
      perInputCandidates = buildPerInputCandidates(registry, activeOutputs, guardOverride, 'after');
      selectionSources.push('input-fallback');
    }
    let operationGuards = collectOperationGuards(registry, operation, guardOverride, {
      timing: 'after',
      variables: outputVariables
    });
    if (operationGuards.length === 0 && activeOutputs === inputVariables && inputVariables.length > 0) {
      operationGuards = collectOperationGuards(registry, operation, guardOverride, {
        timing: 'after',
        variables: inputVariables
      });
    }

    const streamingActive = Boolean(operation?.metadata && (operation.metadata as any).streaming);
    if (process.env.MLLD_DEBUG_GUARDS === '1') {
      const guardNames = [
        ...perInputCandidates.flatMap(c => c.guards.map(g => g.name || g.filterKind)),
        ...operationGuards.map(g => g.name || g.filterKind)
      ].filter(Boolean);
      try {
        console.error('[guard-post-hook] selection', {
          operation: summarizeOperation(operation),
          streamingFlag: (operation.metadata as any)?.streaming,
          selectionSources,
          guardNames
        });
        appendFileSync(
          '/tmp/mlld_guard_post.log',
          JSON.stringify(
            {
              operation: summarizeOperation(operation),
              streamingFlag: (operation.metadata as any)?.streaming,
              selectionSources,
              guardNames
            },
            null,
            2
          ) + '\n'
        );
      } catch {
        // ignore debug logging failures
      }
    }
    if (streamingActive && (perInputCandidates.length > 0 || operationGuards.length > 0)) {
      const streamingMessage = [
        'Cannot run after-guards when streaming is enabled.',
        'Options:',
        '- Remove after-timed guards or change them to before',
        '- Disable streaming with `with { stream: false }`'
      ].join('\n');
      throw new GuardError({
        decision: 'deny',
        message: streamingMessage,
        reason: streamingMessage,
        operation,
        timing: 'after',
        guardResults: [],
        reasons: [streamingMessage]
      });
    }

    if (perInputCandidates.length === 0 && operationGuards.length === 0) {
      logAfterRetryDebug('no after-guards collected', {
        operation: summarizeOperation(operation),
        selectionSources,
        outputCount: outputVariables.length,
        inputCount: inputVariables.length
      });
      return result;
    }

    logAfterRetryDebug('after-guard selection', {
      operation: summarizeOperation(operation),
      selectionSources,
      perInputCandidates: perInputCandidates.map(candidate => ({
        index: candidate.index,
        labels: candidate.labels,
        sources: candidate.sources,
        guards: candidate.guards.map(def => def.name ?? `${def.filterKind}:${def.filterValue}`)
      })),
      operationGuards: operationGuards.map(def => def.name ?? `${def.filterKind}:${def.filterValue}`),
      streamingActive
    });

    const decisionResult = await runPostGuardDecisionEngine({
      perInputCandidates,
      operationGuards,
      outputVariables,
      activeOutputs,
      currentDescriptor,
      baseOutputValue,
      retryContext,
      evaluateGuard: async evaluation =>
        evaluateGuard({
          node,
          env,
          guard: evaluation.guard,
          operation,
          scope: evaluation.scope,
          perInput: evaluation.perInput,
          operationSnapshot: evaluation.operationSnapshot,
          inputHelper: evaluation.inputHelper,
          activeInput: evaluation.activeInput,
          labelsOverride: evaluation.labelsOverride,
          sourcesOverride: evaluation.sourcesOverride,
          inputPreviewOverride: evaluation.inputPreviewOverride,
          outputRaw: evaluation.outputRaw,
          attemptNumber: retryContext.attempt,
          attemptHistory: retryContext.tries,
          maxAttempts: retryContext.max,
          hintHistory: retryContext.hintHistory
        }),
      buildInputHelper: buildGuardInputHelper,
      buildOperationSnapshot,
      resolveGuardValue,
      buildVariablePreview,
      logLabelModifications: async (guard, labelModifications, targets) => {
        await logGuardLabelModifications(env, guard, labelModifications, targets);
      }
    });
    const {
      decision: currentDecision,
      reasons,
      hints,
      guardTrace,
      transformsApplied,
      activeOutputs: nextActiveOutputs,
      currentDescriptor: nextDescriptor
    } = decisionResult;
    activeOutputs = nextActiveOutputs;
    currentDescriptor = nextDescriptor;

  appendGuardHistory(env, operation, currentDecision, guardTrace, hints, reasons);
  const guardName =
    guardTrace[0]?.guard?.name ??
    guardTrace[0]?.guard?.filterKind ??
    '';
  const contextLabels = operation.labels ?? [];
  const provenance =
    env.isProvenanceEnabled?.() === true
      ? getExpressionProvenance(activeOutputs[0] ?? outputVariables[0]) ??
        guardSnapshotDescriptor(env) ??
        makeSecurityDescriptor()
      : undefined;
  env.emitSDKEvent({
    type: 'debug:guard:after',
    guard: guardName,
    labels: contextLabels,
    decision: currentDecision,
    trace: guardTrace,
    hints,
    reasons,
    timestamp: Date.now(),
    ...(provenance && { provenance })
  });

    if (currentDecision === 'allow' && hints.length > 0) {
      emitGuardWarningHints(env, hints);
    }

    if (currentDecision === 'deny') {
      const error = buildPostGuardError({
        guardResults: guardTrace,
        reasons,
        operation,
        outputPreview: buildVariablePreview(activeOutputs[0] ?? outputVariables[0] ?? null),
        timing: 'after'
      });
      throw error;
    }

    if (currentDecision === 'retry') {
      const retryReasons = reasons.length > 0 ? reasons : ['Guard requested retry'];
      const retryHint =
        hints.length > 0 && hints[0] && typeof hints[0].hint === 'string'
          ? hints[0].hint
          : retryReasons[0];
      const pipelineContext = env.getPipelineContext();
      const { sourceRetryable, denyRetry } = evaluateRetryEnforcement(operation, pipelineContext);

      if (denyRetry) {
        logAfterRetryDebug('after-guard retry denied (non-retryable source)', {
          operation: summarizeOperation(operation),
          selectionSources,
          reasons: retryReasons,
          hints,
          sourceRetryable,
          pipeline: Boolean(pipelineContext),
          attempt: retryContext.attempt
        });
        throw buildPostRetryDeniedError({
          guardResults: guardTrace,
          reasons: retryReasons,
          hints,
          operation,
          outputPreview: buildVariablePreview(activeOutputs[0] ?? outputVariables[0] ?? null),
          retryHint
        });
      }

      logAfterRetryDebug('after-guard retry signal', {
        operation: summarizeOperation(operation),
        selectionSources,
        reasons: retryReasons,
        hints,
        sourceRetryable,
        pipeline: Boolean(pipelineContext),
        attempt: retryContext.attempt,
        guardTrace: guardTrace.map(entry => ({
          guard: entry.guardName ?? entry.metadata?.guardFilter,
          decision: entry.decision
        }))
      });

      throw buildPostGuardRetrySignal({
        guardResults: guardTrace,
        reasons: retryReasons,
        hints,
        operation,
        outputPreview: buildVariablePreview(activeOutputs[0] ?? outputVariables[0] ?? null),
        retryHint
      });
    }

    if (transformsApplied && activeOutputs[0]) {
      const finalVariable = activeOutputs[0];
      const finalValue = resolveGuardValue(finalVariable, finalVariable);
      return buildTransformedGuardResult(result, finalVariable, finalValue, currentDescriptor);
    }

    return result;
  });
};

async function evaluateGuard(options: {
  node: HookableNode;
  env: Environment;
  guard: GuardDefinition;
  operation: OperationContext;
  scope: 'perInput' | 'perOperation';
  perInput?: PerInputCandidate;
  operationSnapshot?: OperationSnapshot;
  inputHelper?: GuardInputHelper;
  activeInput?: Variable;
  labelsOverride?: readonly DataLabel[];
  sourcesOverride?: readonly string[];
  inputPreviewOverride?: string | null;
  outputRaw?: unknown;
  attemptNumber?: number;
  attemptHistory?: Array<{ attempt?: number; decision?: string; hint?: string | null }>;
  maxAttempts?: number;
  hintHistory?: Array<string | null>;
}): Promise<GuardResult> {
  const { env, guard, operation, scope } = options;
  const guardEnv = env.createChild();
  inheritParentVariables(env, guardEnv);
  if (process.env.MLLD_DEBUG_GUARDS === '1' && guard.name === 'wrap') {
    try {
      console.error('[guard-post-hook] prefixWith availability', {
        envHas: env.hasVariable('prefixWith'),
        childHas: guardEnv.hasVariable('prefixWith')
      });
    } catch {
      // ignore debug
    }
  }
  ensurePrefixHelper(env, guardEnv);
  ensureTagHelper(env, guardEnv);
  if (!guardEnv.hasVariable('prefixWith') && env.hasVariable('prefixWith')) {
    const existing = env.getVariable('prefixWith');
    if (existing) {
      guardEnv.setVariable('prefixWith', existing);
    }
  }

  let inputVariable: Variable;
  let outputVariable: Variable | undefined;
  let outputValue: unknown;
  let contextLabels: readonly DataLabel[];
  let contextSources: readonly string[];
  let inputPreview: string | null = null;

  if (options.activeInput) {
    inputVariable = cloneVariable(options.activeInput);
    outputVariable = inputVariable;
    outputValue = options.outputRaw !== undefined
      ? options.outputRaw
      : resolveGuardValue(outputVariable, inputVariable);
    contextLabels =
      options.labelsOverride ??
      (Array.isArray(options.activeInput.mx?.labels) ? options.activeInput.mx.labels : []);
    contextSources =
      options.sourcesOverride ??
      (Array.isArray(options.activeInput.mx?.sources) ? options.activeInput.mx.sources : []);
    inputPreview = options.inputPreviewOverride ?? buildVariablePreview(inputVariable);
  } else if (scope === 'perInput' && options.perInput) {
    inputVariable = cloneVariable(options.perInput.variable);
    outputVariable = inputVariable;
    outputValue = options.outputRaw ?? resolveGuardValue(outputVariable, inputVariable);
    contextLabels = options.labelsOverride ?? options.perInput.labels;
    contextSources = options.sourcesOverride ?? options.perInput.sources;
    inputPreview = options.inputPreviewOverride ?? buildVariablePreview(inputVariable);
  } else if (scope === 'perOperation' && options.operationSnapshot) {
    const arrayValue = options.operationSnapshot.variables.slice();
    inputVariable = createArrayVariable('input', arrayValue as any[], false, GUARD_INPUT_SOURCE, {
      isSystem: true,
      isReserved: true
    });
    attachArrayHelpers(inputVariable as any);
    contextLabels = options.labelsOverride ?? options.operationSnapshot.labels;
    contextSources = options.sourcesOverride ?? options.operationSnapshot.sources;
    outputVariable = options.operationSnapshot.variables[0]
      ? cloneVariable(options.operationSnapshot.variables[0]!)
      : undefined;
    outputValue = options.outputRaw ?? resolveGuardValue(outputVariable, inputVariable);
    inputPreview =
      options.inputPreviewOverride ?? `Array(len=${options.operationSnapshot.variables.length})`;
  } else {
    return { guardName: guard.name ?? null, decision: 'allow', timing: 'after' };
  }

  guardEnv.setVariable('input', inputVariable);
  const outputText =
    typeof outputValue === 'string' ? outputValue : outputValue === undefined || outputValue === null ? '' : String(outputValue);
  const guardOutputVariable = createSimpleTextVariable(
    'output',
    outputText as any,
    GUARD_INPUT_SOURCE,
    { security: makeSecurityDescriptor({ labels: contextLabels, sources: contextSources }) }
  );
  guardEnv.setVariable('output', guardOutputVariable);
  if (options.inputHelper) {
    attachGuardHelper(inputVariable, options.inputHelper);
  }

  injectGuardHelpers(guardEnv, {
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
      : DEFAULT_GUARD_MAX;
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
    outputPreview: buildVariablePreview(guardOutputVariable),
    hintHistory,
    timing: 'after'
  } as GuardContextSnapshot;

  const contextSnapshotForMetadata = { ...guardContext };

  const action = await env.withGuardContext(guardContext, async () => {
    return await evaluateGuardBlock(guard.block, guardEnv);
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
    const replacement = await env.withGuardContext(guardContext, async () =>
      evaluateGuardReplacement(action, guardEnv, guard, inputVariable)
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
      location?.filePath ? { filePath: location.filePath, sourceContent: guardEnv.getSource(location.filePath) } : undefined,
      { env: guardEnv }
    );
  }

  const metadata = buildDecisionMetadata(action, guard, {
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

async function evaluateGuardBlock(block: GuardBlockNode, guardEnv: Environment): Promise<GuardActionNode | undefined> {
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
  return cloneVariableWithDescriptor(inputVariable, guardDescriptor);
}

function buildDecisionMetadata(
  action: GuardActionNode,
  guard: GuardDefinition,
  extras?: {
    hint?: string | null;
    inputPreview?: string | null;
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
    decision: action.decision,
    timing: 'after'
  };

  if (extras?.hint !== undefined) {
    metadata.hint = extras.hint;
  }

  if (extras?.inputPreview !== undefined) {
    metadata.inputPreview = extras.inputPreview;
  }

  if (extras?.inputVariable) {
    metadata.guardInput = extras.inputVariable;
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

function buildOperationSnapshot(inputs: readonly Variable[]): OperationSnapshot {
  const aggregate = buildArrayAggregate(inputs, { nameHint: '__guard_output__' });
  return {
    labels: aggregate.labels,
    sources: aggregate.sources,
    variables: inputs
  };
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

function buildGuardInputHelper(inputs: readonly Variable[]): GuardInputHelper | undefined {
  if (!inputs.every(isVariable) || inputs.length === 0) {
    return undefined;
  }
  return createGuardInputHelper(inputs);
}

function injectGuardHelpers(
  guardEnv: Environment,
  options: {
    operation: OperationContext;
    labels: readonly DataLabel[];
    operationLabels: readonly string[];
  }
): void {
  const opKeys = new Set(buildOperationKeys(options.operation).map(key => key.toLowerCase()));
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
  implementation: (args: readonly unknown[]) => unknown | Promise<unknown>
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
    const normalize = (candidate: unknown) => {
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

function cloneVariable(variable: Variable): Variable {
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

function cloneVariableWithDescriptor(
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

function buildVariablePreview(variable: Variable): string | null {
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

function truncatePreview(value: string, limit = 160): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
}

function emitGuardWarningHints(env: Environment, hints: readonly GuardHint[]): void {
  for (const entry of hints) {
    if (!entry || entry.severity !== 'warn') {
      continue;
    }
    const warningText = typeof entry.hint === 'string' ? entry.hint.trim() : '';
    if (!warningText) {
      continue;
    }
    const warning = formatGuardWarning(warningText, null, entry.guardName ?? null);
    env.emitEffect('stderr', `${warning}\n`);
  }
}
