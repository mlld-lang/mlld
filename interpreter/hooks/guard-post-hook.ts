import type { HookableNode } from '@core/types/hooks';
import type { GuardResult, GuardActionNode, GuardBlockNode, GuardHint } from '@core/types/guard';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import type { Variable, VariableSource } from '@core/types/variable';
import { createArrayVariable } from '@core/types/variable';
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
import { materializeGuardInputs } from '../utils/guard-inputs';
import { materializeGuardTransform } from '../utils/guard-transform';
import type { PostHook } from './HookManager';
import type { Environment } from '../env/Environment';
import type { OperationContext, GuardContextSnapshot } from '../env/ContextManager';
import type { EvalResult } from '../core/interpreter';
import type { GuardDefinition } from '../guards/GuardRegistry';
import { isDirectiveHookTarget, isExecHookTarget } from '@core/types/hooks';
import { isVariable } from '../utils/variable-resolution';
import { extractSecurityDescriptor } from '../utils/structured-value';
import { appendGuardHistory } from './guard-shared-history';
import { GuardError } from '@core/errors/GuardError';

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

export const guardPostHook: PostHook = async (node, result, inputs, env, operation) => {
  if (!operation || (isDirectiveHookTarget(node) && node.kind === 'guard')) {
    return result;
  }

  const guardOverride = normalizeGuardOverride(extractGuardOverride(node));
  if (guardOverride.kind === 'disableAll') {
    env.emitEffect('stderr', '[Guard Override] All guards disabled for this operation\n');
    return result;
  }

  const registry = env.getGuardRegistry();
  const outputVariables = materializeGuardInputs([result.value], { nameHint: '__guard_output__' });
  let activeOutputs = outputVariables.slice();
  let currentDescriptor = extractOutputDescriptor(result, activeOutputs[0]);

  const perInputCandidates = buildPerInputCandidates(registry, outputVariables, guardOverride);
  const operationGuards = collectOperationGuards(registry, operation, guardOverride, outputVariables);

  if (perInputCandidates.length === 0 && operationGuards.length === 0) {
    return result;
  }

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
        inputPreviewOverride: buildVariablePreview(currentInput)
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
        inputPreviewOverride: `Array(len=${opSnapshot.variables.length})`
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
    const retryReasons = reasons.slice();
    const defaultReason = 'Guard retry not implemented for after guards';
    if (!retryReasons.includes(defaultReason)) {
      retryReasons.unshift(defaultReason);
    }
    const error = buildGuardError({
      guardResults: guardTrace,
      reasons: retryReasons,
      operation,
      output: activeOutputs[0] ?? outputVariables[0],
      timing: 'after',
      retry: true
    });
    throw error;
  }

  if (transformsApplied && activeOutputs[0]) {
    return { ...result, value: activeOutputs[0] };
  }

  return result;
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
}): Promise<GuardResult> {
  const { env, guard, operation, scope } = options;
  const guardEnv = env.createChild();

  let inputVariable: Variable;
  let contextLabels: readonly DataLabel[];
  let contextSources: readonly string[];
  let inputPreview: string | null = null;

  if (options.activeInput) {
    inputVariable = cloneVariable(options.activeInput);
    contextLabels =
      options.labelsOverride ??
      (Array.isArray(options.activeInput.ctx?.labels) ? options.activeInput.ctx.labels : []);
    contextSources =
      options.sourcesOverride ??
      (Array.isArray(options.activeInput.ctx?.sources) ? options.activeInput.ctx.sources : []);
    inputPreview = options.inputPreviewOverride ?? buildVariablePreview(inputVariable);
  } else if (scope === 'perInput' && options.perInput) {
    inputVariable = cloneVariable(options.perInput.variable);
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
    inputPreview =
      options.inputPreviewOverride ?? `Array(len=${options.operationSnapshot.variables.length})`;
  } else {
    return { guardName: guard.name ?? null, decision: 'allow', timing: 'after' };
  }

  guardEnv.setVariable('input', inputVariable);
  guardEnv.setVariable('output', inputVariable);
  if (options.inputHelper) {
    attachGuardHelper(inputVariable, options.inputHelper);
  }

  injectGuardHelpers(guardEnv, {
    operation,
    labels: contextLabels,
    operationLabels: operation.labels ?? []
  });

  const guardContext: GuardContextSnapshot = {
    name: guard.name,
    attempt: 1,
    try: 1,
    tries: [],
    max: DEFAULT_GUARD_MAX,
    input: inputVariable,
    output: inputVariable,
    labels: contextLabels,
    sources: contextSources,
    inputPreview,
    outputPreview: buildVariablePreview(inputVariable),
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
    const replacement = await evaluateGuardReplacement(action, guardEnv, guard, inputVariable);
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
  for (const rule of block.rules) {
    let matches = false;
    if (rule.isWildcard) {
      matches = true;
    } else if (rule.condition && rule.condition.length > 0) {
      matches = await evaluateCondition(rule.condition, guardEnv);
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
  const values = (node as any).values;
  if (values?.withClause) {
    return values.withClause;
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
