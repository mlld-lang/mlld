import type { HookableNode } from '@core/types/hooks';
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
import { ctxToSecurityDescriptor, updateCtxFromDescriptor } from '@core/types/variable/CtxHelpers';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { evaluateCondition } from '../eval/when';
import { isLetAssignment } from '@core/types/when';
import { VariableImporter } from '../eval/import/VariableImporter';
import { evaluate } from '../core/interpreter';
import { materializeGuardInputs } from '../utils/guard-inputs';
import { materializeGuardTransform } from '../utils/guard-transform';
import type { PostHook } from './HookManager';
import type { Environment } from '../env/Environment';
import type { OperationContext, GuardContextSnapshot } from '../env/ContextManager';
import type { EvalResult } from '../core/interpreter';
import type { GuardDefinition } from '../guards/GuardRegistry';
import { isDirectiveHookTarget, isExecHookTarget } from '@core/types/hooks';
import { isVariable } from '../utils/variable-resolution';
import {
  applySecurityDescriptorToStructuredValue,
  ensureStructuredValue,
  extractSecurityDescriptor
} from '../utils/structured-value';
import { appendGuardHistory } from './guard-shared-history';
import { GuardError } from '@core/errors/GuardError';
import { GuardRetrySignal } from '@core/errors/GuardRetrySignal';
import { appendFileSync } from 'fs';

const DEFAULT_GUARD_MAX = 3;
const afterRetryDebugEnabled = process.env.DEBUG_AFTER_RETRY === '1';

interface GuardRetryRuntimeContext {
  attempt?: number;
  tries?: Array<{ attempt?: number; decision?: string; hint?: string | null }>;
  hintHistory?: Array<string | null>;
  max?: number;
}

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

type GuardOverrideValue = false | { only?: unknown; except?: unknown } | undefined;

interface NormalizedGuardOverride {
  kind: 'none' | 'disableAll' | 'only' | 'except';
  names?: Set<string>;
}

interface PerInputCandidate {
  index: number;
  variable: Variable;
  labels: readonly DataLabel[];
  sources: readonly string[];
  guards: GuardDefinition[];
}

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

function getGuardRetryContext(env: Environment): {
  attempt: number;
  tries: Array<{ attempt: number; decision: string; hint?: string | null }>;
  hintHistory: Array<string | null>;
  max: number;
} {
  const context = env
    .getContextManager()
    .peekGenericContext('guardRetry') as GuardRetryRuntimeContext | undefined;

  const attempt = typeof context?.attempt === 'number' && context.attempt > 0 ? context.attempt : 1;
  const tries = Array.isArray(context?.tries)
    ? context!.tries!.map(entry => ({
        attempt: typeof entry.attempt === 'number' ? entry.attempt : attempt,
        decision: typeof entry.decision === 'string' ? entry.decision : 'retry',
        hint: typeof entry.hint === 'string' || entry.hint === null ? entry.hint : null
      }))
    : [];
  const hintHistory = Array.isArray(context?.hintHistory)
    ? context!.hintHistory!.map(value =>
        typeof value === 'string' || value === null ? value : String(value ?? '')
      )
    : tries.map(entry => entry.hint ?? null);
  const max =
    typeof context?.max === 'number' && context.max > 0 ? context.max : DEFAULT_GUARD_MAX;

  return { attempt, tries, hintHistory, max };
}

function normalizeRawOutput(value: unknown): unknown {
  if (value && typeof value === 'object') {
    if ((value as any).text !== undefined) {
      return (value as any).text;
    }
    if ((value as any).data !== undefined) {
      return (value as any).data;
    }
  }
  return value;
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
    if (guardOverride.kind === 'disableAll') {
      env.emitEffect('stderr', '[Guard Override] All guards disabled for this operation\n');
      return result;
    }
    const selectionSources: string[] = ['output'];

    const retryContext = getGuardRetryContext(env);
    const registry = env.getGuardRegistry();
    const baseOutputValue = normalizeRawOutput(result.value);
    const outputVariables = materializeGuardInputs([result.value], { nameHint: '__guard_output__' });
    const inputVariables = materializeGuardInputs(inputs ?? [], { nameHint: '__guard_input__' });
    if (outputVariables.length === 0) {
      const fallbackValue =
        typeof baseOutputValue === 'string'
          ? baseOutputValue
          : baseOutputValue === undefined || baseOutputValue === null
            ? ''
            : String(baseOutputValue);
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

    let perInputCandidates = buildPerInputCandidates(registry, outputVariables, guardOverride);
    if (perInputCandidates.length === 0 && inputVariables.length > 0) {
      const mergedDescriptor = mergeDescriptors(
        currentDescriptor,
        ...inputVariables
          .map(variable => extractSecurityDescriptor(variable, { recursive: true, mergeArrayElements: true }))
          .filter(Boolean) as SecurityDescriptor[]
      );
      if (mergedDescriptor) {
        currentDescriptor = mergedDescriptor;
      }
      activeOutputs = inputVariables.slice();
      perInputCandidates = buildPerInputCandidates(registry, activeOutputs, guardOverride);
      selectionSources.push('input-fallback');
    }
    let operationGuards = collectOperationGuards(registry, operation, guardOverride, outputVariables);
    if (operationGuards.length === 0 && activeOutputs === inputVariables && inputVariables.length > 0) {
      operationGuards = collectOperationGuards(registry, operation, guardOverride, inputVariables);
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

    const guardTrace: GuardResult[] = [];
    const reasons: string[] = [];
    const hints: GuardHint[] = [];
    let currentDecision: 'allow' | 'deny' | 'retry' = 'allow';
    let transformsApplied = false;

    for (const candidate of perInputCandidates) {
      let currentInput = activeOutputs[0] ?? candidate.variable;

      for (const guard of candidate.guards) {
        const resultEntry = await evaluateGuard({
          node,
          env,
          guard,
          operation,
          scope: 'perInput',
          perInput: candidate,
          inputHelper: buildGuardInputHelper(activeOutputs.length > 0 ? activeOutputs : outputVariables),
          activeInput: currentInput,
          labelsOverride: currentDescriptor.labels,
          sourcesOverride: currentDescriptor.sources,
          inputPreviewOverride: buildVariablePreview(currentInput),
          outputRaw: resolveGuardValue(currentInput, currentInput),
          attemptNumber: retryContext.attempt,
          attemptHistory: retryContext.tries,
          maxAttempts: retryContext.max,
          hintHistory: retryContext.hintHistory
        });
        guardTrace.push(resultEntry);
        if (resultEntry.hint) {
          hints.push(resultEntry.hint);
        }
        if (
          resultEntry.decision === 'allow' &&
          currentDecision === 'allow' &&
          resultEntry.replacement
        ) {
          const replacements = normalizeReplacementVariables(resultEntry.replacement);
          if (replacements.length > 0) {
            const mergedDescriptor = mergeGuardDescriptor(currentDescriptor, replacements, guard);
            applyDescriptorToVariables(mergedDescriptor, replacements);
            currentDescriptor = mergedDescriptor;
            activeOutputs = replacements;
            currentInput = replacements[0];
            transformsApplied = true;
          }
        } else if (resultEntry.decision === 'deny') {
          currentDecision = 'deny';
          if (resultEntry.reason) {
            reasons.push(resultEntry.reason);
          }
        } else if (resultEntry.decision === 'retry' && currentDecision !== 'deny') {
          currentDecision = 'retry';
          if (resultEntry.reason) {
            reasons.push(resultEntry.reason);
          }
        }
      }
    }

    if (operationGuards.length > 0) {
      if (activeOutputs.length === 0 && outputVariables.length > 0) {
        activeOutputs = outputVariables.slice();
      }
      let opSnapshot = buildOperationSnapshot(activeOutputs.length > 0 ? activeOutputs : outputVariables);

      for (const guard of operationGuards) {
        const currentOutputValue =
          activeOutputs[0] ? resolveGuardValue(activeOutputs[0], activeOutputs[0]) : baseOutputValue;
        const resultEntry = await evaluateGuard({
          node,
          env,
          guard,
          operation,
          scope: 'perOperation',
          operationSnapshot: opSnapshot,
          inputHelper: buildGuardInputHelper(activeOutputs.length > 0 ? activeOutputs : outputVariables),
          labelsOverride: opSnapshot.labels,
          sourcesOverride: opSnapshot.sources,
          inputPreviewOverride: `Array(len=${opSnapshot.variables.length})`,
          outputRaw: currentOutputValue,
          attemptNumber: retryContext.attempt,
          attemptHistory: retryContext.tries,
          maxAttempts: retryContext.max,
          hintHistory: retryContext.hintHistory
        });
        guardTrace.push(resultEntry);
        if (resultEntry.hint) {
          hints.push(resultEntry.hint);
        }
        if (resultEntry.decision === 'allow' && resultEntry.replacement && currentDecision === 'allow') {
          const replacements = normalizeReplacementVariables(resultEntry.replacement);
          if (replacements.length > 0) {
            const mergedDescriptor = mergeGuardDescriptor(currentDescriptor, replacements, guard);
            applyDescriptorToVariables(mergedDescriptor, replacements);
            currentDescriptor = mergedDescriptor;
            activeOutputs = replacements;
            transformsApplied = true;
            opSnapshot = buildOperationSnapshot(activeOutputs);
          }
        } else if (resultEntry.decision === 'deny') {
          currentDecision = 'deny';
          if (resultEntry.reason) {
            reasons.push(resultEntry.reason);
          }
        } else if (resultEntry.decision === 'retry' && currentDecision !== 'deny') {
          currentDecision = 'retry';
          if (resultEntry.reason) {
            reasons.push(resultEntry.reason);
          }
        }
      }
    }

    appendGuardHistory(env, operation, currentDecision, guardTrace, hints, reasons);

    if (currentDecision === 'deny') {
      const error = buildGuardError({
        guardResults: guardTrace,
        reasons,
        operation,
        output: activeOutputs[0] ?? outputVariables[0],
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
      const sourceRetryable =
        pipelineContext?.sourceRetryable ??
        Boolean(operation?.metadata && (operation.metadata as any).sourceRetryable);

      if (pipelineContext && !sourceRetryable) {
        logAfterRetryDebug('after-guard retry denied (non-retryable source)', {
          operation: summarizeOperation(operation),
          selectionSources,
          reasons: retryReasons,
          hints,
          sourceRetryable,
          pipeline: Boolean(pipelineContext),
          attempt: retryContext.attempt
        });
        throw new GuardError({
          decision: 'deny',
          guardName: guardTrace[0]?.guardName ?? null,
          guardFilter: guardTrace[0]?.metadata?.guardFilter as string | undefined,
          scope: guardTrace[0]?.metadata?.scope,
          operation,
          inputPreview: guardTrace[0]?.metadata?.inputPreview as string | undefined,
          outputPreview: buildVariablePreview(activeOutputs[0] ?? outputVariables[0] ?? null),
          reasons: retryReasons,
          guardResults: guardTrace,
          hints,
          retryHint,
          reason: `Cannot retry: ${retryHint ?? 'guard requested retry'} (source not retryable)`,
          timing: 'after'
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

      throw buildGuardRetrySignal({
        guardResults: guardTrace,
        reasons: retryReasons,
        hints,
        operation,
        output: activeOutputs[0] ?? outputVariables[0],
        retryHint
      });
    }

    if (transformsApplied && activeOutputs[0]) {
      const finalVariable = activeOutputs[0];
      const finalValue = resolveGuardValue(finalVariable, finalVariable);
      if (typeof finalValue === 'string') {
        const structured = ensureStructuredValue(finalValue, 'text', finalValue);
        applySecurityDescriptorToStructuredValue(structured, currentDescriptor);
        const nextResult = { ...result, value: structured };
        (nextResult as any).stdout = finalValue;
        (nextResult as any).__guardTransformed = structured;
        return nextResult;
      }
      const nextResult = { ...result, value: finalVariable };
      (nextResult as any).__guardTransformed = finalVariable;
      return nextResult;
    }

    return result;
  });
};

function buildPerInputCandidates(
  registry: ReturnType<Environment['getGuardRegistry']>,
  inputs: readonly Variable[],
  override: NormalizedGuardOverride
): PerInputCandidate[] {
  const results: PerInputCandidate[] = [];

  for (let index = 0; index < inputs.length; index++) {
    const variable = inputs[index]!;
    const labels = Array.isArray(variable.ctx?.labels) ? variable.ctx.labels : [];
    const sources = Array.isArray(variable.ctx?.sources) ? variable.ctx.sources : [];

    const seen = new Set<string>();
    const guards: GuardDefinition[] = [];

    for (const label of labels) {
      const defs = registry.getDataGuardsForTiming(label, 'after');
      for (const def of defs) {
        if (!seen.has(def.id)) {
          seen.add(def.id);
          guards.push(def);
        }
      }
    }

    const filteredGuards = applyGuardOverrideFilter(guards, override);

    if (filteredGuards.length > 0) {
      results.push({ index, variable, labels, sources, guards: filteredGuards });
    }
  }

  return results;
}

function collectOperationGuards(
  registry: ReturnType<Environment['getGuardRegistry']>,
  operation: OperationContext,
  override: NormalizedGuardOverride,
  variables: readonly Variable[]
): GuardDefinition[] {
  const keys = buildOperationKeys(operation);
  const seen = new Set<string>();
  const results: GuardDefinition[] = [];

  for (const key of keys) {
    const defs = registry.getOperationGuardsForTiming(key, 'after');
    for (const def of defs) {
      if (!seen.has(def.id)) {
        seen.add(def.id);
        results.push(def);
      }
    }
  }

  if (variables.length > 0) {
    for (const variable of variables) {
      const labels = Array.isArray(variable.ctx?.labels) ? variable.ctx.labels : [];
      for (const label of labels) {
        const defs = registry.getOperationGuardsForTiming(label, 'after');
        for (const def of defs) {
          if (!seen.has(def.id)) {
            seen.add(def.id);
            results.push(def);
          }
        }
      }
    }
  }

  return applyGuardOverrideFilter(results, override);
}

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
      (Array.isArray(options.activeInput.ctx?.labels) ? options.activeInput.ctx.labels : []);
    contextSources =
      options.sourcesOverride ??
      (Array.isArray(options.activeInput.ctx?.sources) ? options.activeInput.ctx.sources : []);
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
    inputVariable = createArrayVariable('input', arrayValue as any[], true, GUARD_INPUT_SOURCE, {
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
    operationLabels: operation.labels ?? []
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
    const replacement = await env.withGuardContext(guardContext, async () =>
      evaluateGuardReplacement(action, guardEnv, guard, inputVariable)
    );
    return {
      guardName: guard.name ?? null,
      decision: 'allow',
      timing: 'after',
      replacement,
      metadata: metadataBase
    };
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
  if (!action || action.decision !== 'allow' || !action.value || action.value.length === 0) {
    return undefined;
  }
  const { evaluate } = await import('../core/interpreter');
  const result = await evaluate(action.value, guardEnv);
  const descriptor =
    inputVariable.ctx && inputVariable.ctx.labels
      ? ctxToSecurityDescriptor(inputVariable.ctx)
      : makeSecurityDescriptor();
  const guardLabel = guard.name ?? guard.filterValue ?? 'guard';
  return materializeGuardTransform(result?.value ?? result, guardLabel, descriptor);
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

function extractGuardOverride(node: HookableNode): GuardOverrideValue {
  const withClause = resolveWithClause(node);
  if (withClause && typeof withClause === 'object' && 'guards' in withClause) {
    return (withClause as any).guards as GuardOverrideValue;
  }
  return undefined;
}

function resolveWithClause(node: HookableNode): unknown {
  if (isExecHookTarget(node)) {
    return (node as any).withClause;
  }
  if ((node as any).withClause) {
    return (node as any).withClause;
  }
  const values = (node as any).values;
  if (values?.withClause) {
    return values.withClause;
  }
  if (values?.value?.withClause) {
    return values.value.withClause;
  }
  if (values?.invocation?.withClause) {
    return values.invocation.withClause;
  }
  if (values?.execInvocation?.withClause) {
    return values.execInvocation.withClause;
  }
  if (values?.execRef?.withClause) {
    return values.execRef.withClause;
  }
  const metaWithClause = (node as any).meta?.withClause;
  if (metaWithClause) {
    return metaWithClause;
  }
  return undefined;
}

function normalizeGuardNames(names: unknown, field: 'only' | 'except'): Set<string> {
  if (!Array.isArray(names)) {
    throw new Error(`Guard override ${field} value must be an array`);
  }
  const normalized = new Set<string>();
  for (const entry of names) {
    if (typeof entry !== 'string') {
      throw new Error(`Guard override ${field} entries must be strings starting with @`);
    }
    const trimmed = entry.trim();
    if (!trimmed.startsWith('@')) {
      throw new Error(`Guard override ${field} entries must start with @`);
    }
    const name = trimmed.slice(1);
    if (!name) {
      throw new Error(`Guard override ${field} entries must include a name after @`);
    }
    normalized.add(name);
  }
  return normalized;
}

function normalizeGuardOverride(raw: GuardOverrideValue): NormalizedGuardOverride {
  if (raw === undefined) {
    return { kind: 'none' };
  }
  if (raw === false) {
    return { kind: 'disableAll' };
  }
  if (raw && typeof raw === 'object') {
    const rawOnly = (raw as any).only;
    const rawExcept = (raw as any).except;
    const hasOnly = Array.isArray(rawOnly);
    const hasExcept = Array.isArray(rawExcept);
    const hasOnlyValue = rawOnly !== undefined;
    const hasExceptValue = rawExcept !== undefined;

    if (hasOnly && hasExcept) {
      throw new Error('Guard override cannot specify both only and except');
    }
    if (hasOnlyValue && !hasOnly) {
      throw new Error('Guard override only value must be an array');
    }
    if (hasExceptValue && !hasExcept) {
      throw new Error('Guard override except value must be an array');
    }
    if (hasOnly) {
      return { kind: 'only', names: normalizeGuardNames(rawOnly, 'only') };
    }
    if (hasExcept) {
      return { kind: 'except', names: normalizeGuardNames(rawExcept, 'except') };
    }
    return { kind: 'none' };
  }
  throw new Error('Guard override must be false or an object');
}

function applyGuardOverrideFilter(guards: GuardDefinition[], override: NormalizedGuardOverride): GuardDefinition[] {
  if (override.kind === 'only') {
    return guards.filter(def => def.name && override.names?.has(def.name));
  }
  if (override.kind === 'except') {
    return guards.filter(def => !def.name || !override.names?.has(def.name));
  }
  return guards;
}

function buildOperationKeys(operation: OperationContext): string[] {
  const keys = new Set<string>();
  if (operation.type) {
    keys.add(operation.type.toLowerCase());
  }
  if (operation.subtype) {
    keys.add(operation.subtype.toLowerCase());
  }
  if (operation.type === 'run') {
    const runSubtype =
      typeof operation.metadata === 'object' && operation.metadata
        ? (operation.metadata as Record<string, unknown>).runSubtype
        : undefined;
    if (typeof runSubtype === 'string') {
      keys.add(runSubtype.toLowerCase());
      if (runSubtype === 'runCommand') {
        keys.add('cmd');
      } else if (runSubtype.startsWith('runExec')) {
        keys.add('exec');
      } else if (runSubtype === 'runCode') {
        const language =
          typeof operation.metadata === 'object' && operation.metadata
            ? (operation.metadata as Record<string, unknown>).language
            : undefined;
        if (typeof language === 'string' && language.length > 0) {
          keys.add(language.toLowerCase());
        }
      }
    }
  }

  return Array.from(keys);
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
      ctx: {},
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
    ctx: {
      ...(variable.ctx ?? {})
    },
    internal: {
      ...(variable.internal ?? {}),
      isReserved: true,
      isSystem: true
    }
  };
  if (clone.ctx?.ctxCache) {
    delete clone.ctx.ctxCache;
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

function buildGuardError(options: {
  guardResults: GuardResult[];
  reasons: string[];
  operation: OperationContext;
  output?: Variable;
  timing: 'after';
  retry?: boolean;
}): Error {
  const primaryReason = options.reasons[0] ?? 'Guard blocked operation';
  const guardContext = options.guardResults[0]?.metadata?.guardContext as GuardContextSnapshot | undefined;
  return new GuardError({
    decision: options.retry ? 'retry' : 'deny',
    guardName: options.guardResults[0]?.guardName ?? null,
    guardFilter: options.guardResults[0]?.metadata?.guardFilter as string | undefined,
    scope: options.guardResults[0]?.metadata?.scope,
    operation: options.operation,
    inputPreview: options.guardResults[0]?.metadata?.inputPreview as string | undefined,
    outputPreview: options.output ? buildVariablePreview(options.output) : null,
    reasons: options.reasons,
    guardResults: options.guardResults,
    hints: options.guardResults.flatMap(entry => (entry.hint ? [entry.hint] : [])),
    timing: 'after',
    reason: primaryReason,
    guardContext
  });
}

function buildGuardRetrySignal(options: {
  guardResults: GuardResult[];
  reasons: string[];
  hints?: GuardHint[];
  operation: OperationContext;
  output?: Variable;
  retryHint?: string | null;
}): GuardRetrySignal {
  const primaryReason = options.reasons[0] ?? 'Guard requested retry';
  const guardContext = options.guardResults[0]?.metadata?.guardContext as GuardContextSnapshot | undefined;
  return new GuardRetrySignal({
    guardName: options.guardResults[0]?.guardName ?? null,
    guardFilter: options.guardResults[0]?.metadata?.guardFilter as string | undefined,
    scope: options.guardResults[0]?.metadata?.scope,
    operation: options.operation,
    inputPreview: options.guardResults[0]?.metadata?.inputPreview as string | undefined,
    outputPreview: options.output ? buildVariablePreview(options.output) : null,
    reasons: options.reasons,
    guardResults: options.guardResults,
    hints: options.hints ?? options.guardResults.flatMap(entry => (entry.hint ? [entry.hint] : [])),
    timing: 'after',
    retryHint: options.retryHint ?? null,
    reason: primaryReason,
    guardContext
  });
}

function normalizeReplacementVariables(value: unknown): Variable[] {
  if (isVariable(value as Variable)) {
    return [value as Variable];
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).filter(item => isVariable(item as Variable)) as Variable[];
  }
  return [];
}

function extractOutputDescriptor(result: EvalResult, output?: Variable): SecurityDescriptor {
  const valueDescriptor = extractSecurityDescriptor(result.value, {
    recursive: true,
    mergeArrayElements: true
  });
  const resultDescriptor =
    result && typeof result === 'object' && 'ctx' in result
      ? extractSecurityDescriptor((result as Record<string, unknown>).ctx, { recursive: true })
      : undefined;
  const outputDescriptor = output?.ctx ? ctxToSecurityDescriptor(output.ctx) : undefined;
  return mergeDescriptors(valueDescriptor, resultDescriptor, outputDescriptor, makeSecurityDescriptor());
}

function mergeGuardDescriptor(
  current: SecurityDescriptor,
  replacements: readonly Variable[],
  guard: GuardDefinition
): SecurityDescriptor {
  const guardSource = guard.name ?? guard.filterValue ?? 'guard';
  const descriptors: SecurityDescriptor[] = [current];
  for (const variable of replacements) {
    const descriptor = extractSecurityDescriptor(variable, {
      recursive: true,
      mergeArrayElements: true
    });
    if (descriptor) {
      descriptors.push(descriptor);
    }
  }
  descriptors.push(makeSecurityDescriptor({ sources: [`guard:${guardSource}`] }));
  return mergeDescriptors(...descriptors);
}

function applyDescriptorToVariables(
  descriptor: SecurityDescriptor,
  variables: readonly Variable[]
): void {
  for (const variable of variables) {
    const ctx = (variable.ctx ?? (variable.ctx = {} as any)) as Record<string, unknown>;
    updateCtxFromDescriptor(ctx, descriptor);
    if ('ctxCache' in ctx) {
      delete (ctx as any).ctxCache;
    }
  }
}
