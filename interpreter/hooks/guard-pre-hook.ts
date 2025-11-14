import type { DirectiveNode } from '@core/types';
import type { GuardDefinition, GuardScope } from '../guards';
import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import type { HookDecision, PreHook } from './HookManager';
import type { GuardBlockNode, GuardActionNode, GuardDecisionType } from '@core/types/guard';
import type { Variable, VariableSource } from '@core/types/variable';
import { createArrayVariable } from '@core/types/variable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable } from '@core/types/executable';
import { buildArrayAggregate } from '@core/types/variable/ArrayHelpers';
import type { ArrayAggregateSnapshot } from '@core/types/variable/ArrayHelpers';
import type { DataLabel } from '@core/types/security';
import { evaluateCondition } from '../eval/when';
import { isVariable } from '../utils/variable-resolution';

type GuardHelperImplementation = (args: readonly unknown[]) => unknown | Promise<unknown>;

interface PerInputCandidate {
  variable: Variable;
  labels: readonly DataLabel[];
  sources: readonly string[];
  guards: GuardDefinition[];
}

interface OperationSnapshot {
  labels: readonly DataLabel[];
  sources: readonly string[];
  aggregate: ArrayAggregateSnapshot;
  variables: readonly Variable[];
}

interface GuardAttemptEntry {
  attempt: number;
  decision: GuardDecisionType;
  hint?: string | null;
}

interface GuardAttemptState {
  nextAttempt: number;
  history: GuardAttemptEntry[];
}

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

const guardAttemptStores = new WeakMap<Environment, Map<string, GuardAttemptState>>();

function getRootEnvironment(env: Environment): Environment {
  let current: Environment | undefined = env;
  while (current.getParent()) {
    current = current.getParent();
  }
  return current!;
}

function getAttemptStore(env: Environment): Map<string, GuardAttemptState> {
  const root = getRootEnvironment(env);
  let store = guardAttemptStores.get(root);
  if (!store) {
    store = new Map();
    guardAttemptStores.set(root, store);
  }
  return store;
}

function buildVariableIdentity(variable?: Variable): string {
  if (!variable) {
    return 'operation';
  }
  const definedAt = (variable.metadata as any)?.definedAt;
  const location =
    definedAt && typeof definedAt === 'object'
      ? `${definedAt.filePath ?? ''}:${definedAt.line ?? ''}:${definedAt.column ?? ''}`
      : '';
  return `${variable.name ?? 'input'}::${location}`;
}

function buildOperationIdentity(operation: OperationContext): string {
  const trace = (operation.metadata?.trace as string | undefined) ?? '';
  return `${trace}:${operation.type}:${operation.name ?? ''}`;
}

function buildGuardAttemptKey(
  guard: GuardDefinition,
  operation: OperationContext,
  scope: GuardScope,
  variable?: Variable
): string {
  return `${buildOperationIdentity(operation)}::${guard.id}::${scope}::${buildVariableIdentity(variable)}`;
}

function truncatePreview(value: string, limit = 160): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
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

function buildInputPreview(
  scope: GuardScope,
  perInput?: PerInputCandidate,
  operationSnapshot?: OperationSnapshot
): string | null {
  if (scope === 'perInput' && perInput) {
    return buildVariablePreview(perInput.variable);
  }
  if (scope === 'perOperation' && operationSnapshot) {
    return `Array(len=${operationSnapshot.variables.length})`;
  }
  return null;
}

function clearGuardAttemptState(store: Map<string, GuardAttemptState>, key: string): void {
  store.delete(key);
}

export const guardPreHook: PreHook = async (
  directive,
  inputs,
  env,
  operation,
  helpers
): Promise<HookDecision> => {
  if (!operation || directive.kind === 'guard') {
    return { action: 'continue' };
  }

  const registry = env.getGuardRegistry();
  const variableInputs = inputs.filter(isVariable);

  const perInputCandidates = buildPerInputCandidates(registry, variableInputs);
  const operationGuards = collectOperationGuards(registry, directive, operation);

  if (perInputCandidates.length === 0 && operationGuards.length === 0) {
    return { action: 'continue' };
  }

  for (const candidate of perInputCandidates) {
    for (const guard of candidate.guards) {
      const decision = await evaluateGuard({
        directive,
        env,
        guard,
        operation,
        scope: 'perInput',
        perInput: candidate
      });
      if (decision && decision.action !== 'continue') {
        return decision;
      }
    }
  }

  if (operationGuards.length > 0) {
    const opSnapshot = buildOperationSnapshot(variableInputs);
    for (const guard of operationGuards) {
      const decision = await evaluateGuard({
        directive,
        env,
        guard,
        operation,
        scope: 'perOperation',
        operationSnapshot: opSnapshot
      });
      if (decision && decision.action !== 'continue') {
        return decision;
      }
    }
  }

  return { action: 'continue' };
};

function buildPerInputCandidates(
  registry: ReturnType<Environment['getGuardRegistry']>,
  inputs: readonly Variable[]
): PerInputCandidate[] {
  const results: PerInputCandidate[] = [];

  for (const variable of inputs) {
    const descriptor = variable.metadata?.security;
    const labels = Array.isArray(descriptor?.labels) ? descriptor!.labels : [];
    const sources = Array.isArray(descriptor?.sources) ? descriptor!.sources : [];

    const seen = new Set<string>();
    const guards: GuardDefinition[] = [];

    for (const label of labels) {
      const defs = registry.getDataGuards(label);
      for (const def of defs) {
        if (!seen.has(def.id)) {
          seen.add(def.id);
          guards.push(def);
        }
      }
    }

    if (guards.length > 0) {
      results.push({ variable, labels, sources, guards });
    }
  }

  return results;
}

function collectOperationGuards(
  registry: ReturnType<Environment['getGuardRegistry']>,
  directive: DirectiveNode,
  operation: OperationContext
): GuardDefinition[] {
  const keys = buildOperationKeys(directive, operation);
  const seen = new Set<string>();
  const results: GuardDefinition[] = [];

  for (const key of keys) {
    const defs = registry.getOperationGuards(key);
    for (const def of defs) {
      if (!seen.has(def.id)) {
        seen.add(def.id);
        results.push(def);
      }
    }
  }

  return results;
}

function buildOperationSnapshot(inputs: readonly Variable[]): OperationSnapshot {
  const aggregate = buildArrayAggregate(inputs);
  return {
    labels: aggregate.labels,
    sources: aggregate.sources,
    aggregate,
    variables: inputs
  };
}

async function evaluateGuard(options: {
  directive: DirectiveNode;
  env: Environment;
  guard: GuardDefinition;
  operation: OperationContext;
  scope: GuardScope;
  perInput?: PerInputCandidate;
  operationSnapshot?: OperationSnapshot;
}): Promise<HookDecision | null> {
  const { env, guard, operation, scope } = options;
  const guardEnv = env.createChild();
  const attemptStore = getAttemptStore(env);
  const attemptKey = buildGuardAttemptKey(guard, operation, scope, options.perInput?.variable);
  const attemptState = attemptStore.get(attemptKey);
  const attemptNumber = attemptState?.nextAttempt ?? 1;
  const attemptHistory = attemptState ? attemptState.history.slice() : [];

  let inputVariable: Variable;
  let contextLabels: readonly DataLabel[];
  let contextSources: readonly string[];
  const inputPreview = buildInputPreview(scope, options.perInput, options.operationSnapshot) ?? null;

  if (scope === 'perInput' && options.perInput) {
    inputVariable = cloneVariableForGuard(options.perInput.variable);
    contextLabels = options.perInput.labels;
    contextSources = options.perInput.sources;
  } else if (scope === 'perOperation' && options.operationSnapshot) {
    const arrayValue = options.operationSnapshot.variables.slice();
    inputVariable = createArrayVariable('input', arrayValue as any[], true, GUARD_INPUT_SOURCE, {
      isSystem: true
    });
    contextLabels = options.operationSnapshot.aggregate.labels;
    contextSources = options.operationSnapshot.aggregate.sources;
  } else {
    return null;
  }

  guardEnv.setVariable('input', inputVariable);

  injectGuardHelpers(guardEnv, {
    directive: options.directive,
    operation,
    guardHelper: options.operationSnapshot?.helper ?? options.guardHelper,
    labels: contextLabels,
    operationLabels: operation.labels ?? []
  });

  const guardContext = {
    name: guard.name,
    attempt: attemptNumber,
    try: attemptNumber,
    tries: attemptHistory.map(entry => ({ ...entry })),
    max: DEFAULT_GUARD_MAX,
    input: inputVariable,
    labels: contextLabels,
    sources: contextSources,
    inputPreview,
    hintHistory: attemptHistory.map(entry => entry.hint ?? null)
  };

  const action = await env.withGuardContext(guardContext, async () => {
    return await evaluateGuardBlock(guard.block, guardEnv);
  });

  if (!action || action.decision === 'allow') {
    clearGuardAttemptState(attemptStore, attemptKey);
    return null;
  }

  const metadata = buildDecisionMetadata(action, guard, {
    inputPreview,
    attempt: attemptNumber,
    tries: attemptHistory
  });
  if (action.decision === 'deny') {
    clearGuardAttemptState(attemptStore, attemptKey);
    return { action: 'abort', metadata };
  }
  if (action.decision === 'retry') {
    const entry: GuardAttemptEntry = {
      attempt: attemptNumber,
      decision: 'retry',
      hint: action.message ?? null
    };
    const updatedHistory = [...attemptHistory, entry];
    attemptStore.set(attemptKey, {
      nextAttempt: attemptNumber + 1,
      history: updatedHistory
    });
    const retryMetadata = buildDecisionMetadata(action, guard, {
      hint: action.message ?? null,
      inputPreview,
      attempt: attemptNumber,
      tries: updatedHistory
    });
    return { action: 'retry', metadata: retryMetadata };
  }
  clearGuardAttemptState(attemptStore, attemptKey);
  return null;
}

async function evaluateGuardBlock(
  block: GuardBlockNode,
  guardEnv: Environment
): Promise<GuardActionNode | undefined> {
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

function buildDecisionMetadata(
  action: GuardActionNode,
  guard: GuardDefinition,
  extras?: {
    hint?: string | null;
    inputPreview?: string | null;
    attempt?: number;
    tries?: GuardAttemptEntry[];
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

  return metadata;
}

function cloneVariableForGuard(variable: Variable): Variable {
  const clone: Variable = {
    ...variable,
    name: 'input',
    metadata: variable.metadata ? { ...variable.metadata } : undefined
  };
  if (clone.metadata?.ctxCache) {
    delete clone.metadata.ctxCache;
  }
  return clone;
}

function injectGuardHelpers(
  guardEnv: Environment,
  options: {
    directive: DirectiveNode;
    operation: OperationContext;
    labels: readonly DataLabel[];
    operationLabels: readonly string[];
  }
): void {
  const opKeys = buildOperationKeySet(options.directive, options.operation);
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
      isSystem: true
    }
  );
  const metadata = execVar.metadata ?? (execVar.metadata = {});
  metadata.executableDef = execVar.value;
  (metadata as any).isGuardHelper = true;
  (metadata as any).guardHelperImplementation = implementation;
  return execVar;
}

function buildOperationKeys(
  directive: DirectiveNode,
  operation: OperationContext
): string[] {
  const keys = new Set<string>();
  keys.add(operation.type);

  if (directive.kind === 'run') {
    if (directive.subtype === 'runCommand') {
      keys.add('cmd');
    } else if (directive.subtype === 'runCode') {
      const language = (directive.meta?.language as string | undefined)?.toLowerCase();
      if (language) {
        keys.add(language);
      }
    } else if (directive.subtype?.startsWith('runExec')) {
      keys.add('exec');
    }
  }

  return Array.from(keys);
}

function buildOperationKeySet(directive: DirectiveNode, operation: OperationContext): Set<string> {
  const keys = buildOperationKeys(directive, operation);
  const normalized = new Set<string>();
  for (const key of keys) {
    normalized.add(key.toLowerCase());
  }
  return normalized;
}
