import type { GuardHint } from '@core/types/guard';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import type { Variable, VariableSource } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable } from '@core/types/executable';
import { buildArrayAggregate, createGuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
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
            injectGuardHelpers,
            attachGuardInputHelper: attachGuardHelper,
            cloneVariable,
            resolveGuardValue,
            buildVariablePreview,
            replacementDependencies: {
              cloneVariableWithDescriptor
            }
          }
        ),
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
  ensurePrefixHelper(sourceEnv, guardEnv);
  ensureTagHelper(sourceEnv, guardEnv);
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

function buildOperationSnapshot(inputs: readonly Variable[]): GuardOperationSnapshot {
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
