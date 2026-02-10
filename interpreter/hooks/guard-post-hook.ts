import type { GuardHint } from '@core/types/guard';
import type { Variable, VariableSource } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { buildArrayAggregate, createGuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import { makeSecurityDescriptor } from '@core/types/security';
import { MlldSecurityError } from '@core/errors';
import { materializeGuardInputs } from '../utils/guard-inputs';
import type { PostHook } from './HookManager';
import type { Environment } from '../env/Environment';
import {
  guardSnapshotDescriptor,
  logGuardLabelModifications
} from './guard-utils';
import type { OperationContext } from '../env/ContextManager';
import type { EvalResult } from '../core/interpreter';
import type { GuardDefinition } from '../guards/GuardRegistry';
import { isDirectiveHookTarget } from '@core/types/hooks';
import { isVariable } from '../utils/variable-resolution';
import { extractSecurityDescriptor } from '../utils/structured-value';
import { buildPerInputCandidates, collectOperationGuards } from './guard-candidate-selection';
import {
  extractOutputDescriptor,
  mergeDescriptorWithFallbackInputs
} from './guard-post-descriptor';
import {
  buildTransformedGuardResult,
  normalizeFallbackOutputValue,
  normalizeRawOutput
} from './guard-post-output-normalization';
import {
  runPostGuardDecisionEngine,
  type GuardOperationSnapshot
} from './guard-post-decision-engine';
import { evaluateRetryEnforcement, getGuardRetryContext } from './guard-post-retry';
import {
  buildPostGuardError,
  buildPostRetryDeniedError,
  buildPostGuardRetrySignal
} from './guard-post-signals';
import { evaluatePostGuardRuntime } from './guard-post-runtime-evaluator';
import {
  attachPostGuardInputHelper,
  ensurePostPrefixHelper,
  ensurePostTagHelper,
  injectPostGuardHelpers
} from './guard-post-helper-injection';
import {
  buildPostVariablePreview,
  clonePostGuardVariable,
  clonePostGuardVariableWithDescriptor,
  resolvePostGuardValue
} from './guard-post-materialization';
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
        evaluatePostGuardRuntime(
          {
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
          },
          {
            guardInputSource: GUARD_INPUT_SOURCE,
            prepareGuardEnvironment: preparePostGuardEnvironment,
            injectGuardHelpers: injectPostGuardHelpers,
            attachGuardInputHelper: attachPostGuardInputHelper,
            cloneVariable: clonePostGuardVariable,
            resolveGuardValue: resolvePostGuardValue,
            buildVariablePreview: buildPostVariablePreview,
            replacementDependencies: {
              cloneVariableWithDescriptor: clonePostGuardVariableWithDescriptor
            }
          }
        ),
      buildInputHelper: buildGuardInputHelper,
      buildOperationSnapshot,
      resolveGuardValue: resolvePostGuardValue,
      buildVariablePreview: buildPostVariablePreview,
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
        outputPreview: buildGuardOutputPreview(activeOutputs[0], outputVariables[0]),
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
          outputPreview: buildGuardOutputPreview(activeOutputs[0], outputVariables[0]),
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
        outputPreview: buildGuardOutputPreview(activeOutputs[0], outputVariables[0]),
        retryHint
      });
    }

    if (transformsApplied && activeOutputs[0]) {
      const finalVariable = activeOutputs[0];
      const finalValue = resolvePostGuardValue(finalVariable, finalVariable);
      return buildTransformedGuardResult(result, finalVariable, finalValue, currentDescriptor);
    }

    return result;
  });
};

function preparePostGuardEnvironment(
  sourceEnv: Environment,
  guardEnv: Environment,
  guard: GuardDefinition
): void {
  inheritParentVariables(sourceEnv, guardEnv);
  if (process.env.MLLD_DEBUG_GUARDS === '1' && guard.name === 'wrap') {
    try {
      console.error('[guard-post-hook] prefixWith availability', {
        envHas: sourceEnv.hasVariable('prefixWith'),
        childHas: guardEnv.hasVariable('prefixWith')
      });
    } catch {
      // ignore debug
    }
  }
  ensurePostPrefixHelper(sourceEnv, guardEnv);
  ensurePostTagHelper(sourceEnv, guardEnv);
  if (!guardEnv.hasVariable('prefixWith') && sourceEnv.hasVariable('prefixWith')) {
    const existing = sourceEnv.getVariable('prefixWith');
    if (existing) {
      guardEnv.setVariable('prefixWith', existing);
    }
  }
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

function buildOperationSnapshot(inputs: readonly Variable[]): GuardOperationSnapshot {
  const aggregate = buildArrayAggregate(inputs, { nameHint: '__guard_output__' });
  return {
    labels: aggregate.labels,
    sources: aggregate.sources,
    variables: inputs
  };
}

function buildGuardOutputPreview(
  primary: Variable | undefined,
  fallback: Variable | undefined
): string | null {
  const candidate = primary ?? fallback;
  if (!candidate) {
    return null;
  }
  return buildPostVariablePreview(candidate);
}

function buildGuardInputHelper(inputs: readonly Variable[]): GuardInputHelper | undefined {
  if (!inputs.every(isVariable) || inputs.length === 0) {
    return undefined;
  }
  return createGuardInputHelper(inputs);
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
