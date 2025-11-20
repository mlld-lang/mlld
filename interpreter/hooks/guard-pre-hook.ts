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
import type { Variable, VariableSource } from '@core/types/variable';
import { createArrayVariable } from '@core/types/variable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable } from '@core/types/executable';
import { attachArrayHelpers, buildArrayAggregate } from '@core/types/variable/ArrayHelpers';
import type { ArrayAggregateSnapshot, GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { DataLabel } from '@core/types/security';
import { evaluateCondition } from '../eval/when';
import { isVariable } from '../utils/variable-resolution';
import { interpreterLogger } from '@core/utils/logger';
import type { HookableNode } from '@core/types/hooks';
import { isDirectiveHookTarget } from '@core/types/hooks';
import { materializeGuardInputs } from '../utils/guard-inputs';
import { ctxToSecurityDescriptor } from '@core/types/variable/CtxHelpers';
import { makeSecurityDescriptor } from '@core/types/security';
import { materializeGuardTransform } from '../utils/guard-transform';

type GuardHelperImplementation = (args: readonly unknown[]) => unknown | Promise<unknown>;

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
  return isDirectiveHookTarget(node) ? node.kind : 'exe';
}

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
  const definedAt = variable.ctx?.definedAt;
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
  operation: OperationContext,
  scope: GuardScope,
  variable?: Variable
): string {
  return `${buildOperationIdentity(operation)}::${scope}::${buildVariableIdentity(variable)}`;
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
  node,
  inputs,
  env,
  operation,
  helpers
): Promise<HookDecision> => {
  if (!operation || (isDirectiveHookTarget(node) && node.kind === 'guard')) {
    return { action: 'continue' };
  }

  const registry = env.getGuardRegistry();
  const variableInputs = materializeGuardInputs(inputs, { nameHint: '__guard_input__' });

  const perInputCandidates = buildPerInputCandidates(registry, variableInputs);
  const operationGuards = collectOperationGuards(registry, operation);

  if (perInputCandidates.length === 0 && operationGuards.length === 0) {
    return { action: 'continue' };
  }

  const attemptStore = getAttemptStore(env);
  const guardTrace: GuardResult[] = [];
  const reasons: string[] = [];
  const hints: GuardHint[] = [];
  const usedAttemptKeys = new Set<string>();
  let currentDecision: 'allow' | 'deny' | 'retry' = 'allow';
  let primaryMetadata: Record<string, unknown> | undefined;

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
      if (result.hint) {
        hints.push(result.hint);
      }
      if (result.decision === 'allow' && currentDecision === 'allow') {
        if (result.replacement && isVariable(result.replacement as Variable)) {
          currentInput = result.replacement as Variable;
        }
      } else if (result.decision === 'deny') {
        currentDecision = 'deny';
        if (result.reason) {
          reasons.push(result.reason);
        }
        if (!primaryMetadata && result.metadata) {
          primaryMetadata = result.metadata;
        }
      } else if (result.decision === 'retry' && currentDecision !== 'deny') {
        currentDecision = 'retry';
        if (result.reason) {
          reasons.push(result.reason);
        }
        if (!primaryMetadata && result.metadata) {
          primaryMetadata = result.metadata;
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
    const opSnapshot = buildOperationSnapshot(transformedInputs);

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
      if (result.hint) {
        hints.push(result.hint);
      }
      if (result.decision === 'allow' && currentDecision === 'allow') {
        if (result.replacement && Array.isArray(result.replacement)) {
          // Allow aggregation to replace the entire input set
          transformedInputs.splice(0, transformedInputs.length, ...(result.replacement as Variable[]));
        }
      } else if (result.decision === 'deny') {
        currentDecision = 'deny';
        if (result.reason) {
          reasons.push(result.reason);
        }
        if (!primaryMetadata && result.metadata) {
          primaryMetadata = result.metadata;
        }
      } else if (result.decision === 'retry') {
        currentDecision = 'retry';
        if (result.reason) {
          reasons.push(result.reason);
        }
        if (!primaryMetadata && result.metadata) {
          primaryMetadata = result.metadata;
        }
      }
    }
  }

  if (currentDecision === 'allow') {
    for (const key of usedAttemptKeys) {
      clearGuardAttemptState(attemptStore, key);
    }
    return {
      action: 'continue',
      metadata: buildAggregateMetadata({
        guardResults: guardTrace,
        reasons,
        hints,
        transformedInputs
      })
    };
  }

  if (currentDecision === 'retry') {
    return {
      action: 'retry',
      metadata: buildAggregateMetadata({
        guardResults: guardTrace,
        reasons,
        hints,
        primaryMetadata
      })
    };
  }

  return {
    action: 'abort',
    metadata: (() => {
      for (const key of usedAttemptKeys) {
        clearGuardAttemptState(attemptStore, key);
      }
      return buildAggregateMetadata({
        guardResults: guardTrace,
        reasons,
        hints,
        primaryMetadata
      });
    })()
  };
};

function buildPerInputCandidates(
  registry: ReturnType<Environment['getGuardRegistry']>,
  inputs: readonly Variable[]
): PerInputCandidate[] {
  const results: PerInputCandidate[] = [];

  for (let index = 0; index < inputs.length; index++) {
    const variable = inputs[index]!;
    const labels = Array.isArray(variable.ctx?.labels) ? variable.ctx.labels : [];
    const sources = Array.isArray(variable.ctx?.sources) ? variable.ctx.sources : [];

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
      results.push({ index, variable, labels, sources, guards });
    }
  }

  return results;
}

function collectOperationGuards(
  registry: ReturnType<Environment['getGuardRegistry']>,
  operation: OperationContext
): GuardDefinition[] {
  const keys = buildOperationKeys(operation);
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
  const aggregate = buildArrayAggregate(inputs, { nameHint: '__guard_input__' });
  return {
    labels: aggregate.labels,
    sources: aggregate.sources,
    aggregate,
    variables: inputs
  };
}

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
      isSystem: true,
      isReserved: true
    });
    attachArrayHelpers(inputVariable as any);
    contextLabels = options.operationSnapshot.aggregate.labels;
    contextSources = options.operationSnapshot.aggregate.sources;
  } else {
    return { guardName: guard.name ?? null, decision: 'allow' };
  }

  guardEnv.setVariable('input', inputVariable);
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
    attempt: options.attemptNumber,
    try: options.attemptNumber,
    tries: options.attemptHistory.map(entry => ({ ...entry })),
    max: DEFAULT_GUARD_MAX,
    input: inputVariable,
    labels: contextLabels,
    sources: contextSources,
    inputPreview,
    hintHistory: options.attemptHistory.map(entry => entry.hint ?? null)
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

  const action = await env.withGuardContext(guardContext, async () => {
    return await evaluateGuardBlock(guard.block, guardEnv);
  });

  const metadataBase: Record<string, unknown> = {
    guardName: guard.name ?? null,
    guardFilter: `${guard.filterKind}:${guard.filterValue}`,
    scope,
    inputPreview,
    guardContext: contextSnapshotForMetadata,
    guardInput: inputVariable
  };

  if (!action || action.decision === 'allow') {
    const replacement = await evaluateGuardReplacement(action, guardEnv, guard, inputVariable);
    return {
      guardName: guard.name ?? null,
      decision: 'allow',
      replacement,
      metadata: metadataBase
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
    metadata
  };
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
    metadata.guardInput = extras.inputVariable;
  }

  if (extras?.contextSnapshot) {
    metadata.guardContext = extras.contextSnapshot;
  }

  return metadata;
}

function cloneVariableForGuard(variable: Variable): Variable {
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

function cloneGuardContextSnapshot(context: GuardContextSnapshot): GuardContextSnapshot {
  const cloned: GuardContextSnapshot = {
    ...context,
    tries: context.tries ? context.tries.map(entry => ({ ...entry })) : undefined,
    labels: context.labels ? [...context.labels] : undefined,
    sources: context.sources ? [...context.sources] : undefined,
    hintHistory: context.hintHistory ? [...context.hintHistory] : undefined
  };
  if (context.input !== undefined) {
    cloned.input = cloneGuardContextInput(context.input);
  }
  return cloned;
}

function cloneGuardContextInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => (isVariable(item) ? cloneVariableForGuard(item) : item));
  }
  if (isVariable(value as Variable)) {
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

function buildOperationKeySet(operation: OperationContext): Set<string> {
  const keys = buildOperationKeys(operation);
  const normalized = new Set<string>();
  for (const key of keys) {
    normalized.add(key.toLowerCase());
  }
  return normalized;
}

function buildAggregateMetadata(options: {
  guardResults: GuardResult[];
  reasons?: string[];
  hints?: GuardHint[];
  transformedInputs?: readonly Variable[];
  primaryMetadata?: Record<string, unknown> | undefined;
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

  if (!metadata.reason && options.reasons && options.reasons.length > 0) {
    metadata.reason = options.reasons[0];
  }

  return metadata;
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
