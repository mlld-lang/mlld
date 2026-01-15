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
import { createArrayVariable, createSimpleTextVariable } from '@core/types/variable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { ExecutableVariable } from '@core/types/executable';
import { attachArrayHelpers, buildArrayAggregate } from '@core/types/variable/ArrayHelpers';
import type { ArrayAggregateSnapshot, GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { DataLabel } from '@core/types/security';
import { evaluateCondition } from '../eval/when';
import { isLetAssignment, isAugmentedAssignment } from '@core/types/when';
import { guardSnapshotDescriptor } from './guard-utils';
import { VariableImporter } from '../eval/import/VariableImporter';
import { evaluate } from '../core/interpreter';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { combineValues } from '../utils/value-combine';
import { MlldWhenExpressionError } from '@core/errors';
import { interpreterLogger } from '@core/utils/logger';
import type { HookableNode } from '@core/types/hooks';
import { isDirectiveHookTarget, isEffectHookTarget, isExecHookTarget } from '@core/types/hooks';
import { materializeGuardInputs } from '../utils/guard-inputs';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { makeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import { materializeGuardTransform } from '../utils/guard-transform';
import { appendGuardHistory } from './guard-shared-history';
import { appendFileSync } from 'fs';
import { getExpressionProvenance } from '../utils/expression-provenance';

type GuardHelperImplementation = (args: readonly unknown[]) => unknown | Promise<unknown>;

interface PerInputCandidate {
  index: number;
  variable: Variable;
  labels: readonly DataLabel[];
  sources: readonly string[];
  taint: readonly string[];
  guards: GuardDefinition[];
}

interface OperationSnapshot {
  labels: readonly DataLabel[];
  sources: readonly string[];
  taint: readonly string[];
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

type GuardOverrideValue = false | { only?: unknown; except?: unknown } | undefined;

interface NormalizedGuardOverride {
  kind: 'none' | 'disableAll' | 'only' | 'except';
  names?: Set<string>;
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
  if (isDirectiveHookTarget(node)) {
    return node.kind;
  }
  if (isEffectHookTarget(node)) {
    return `effect:${(node as any).rawIdentifier ?? 'unknown'}`;
  }
  return 'exe';
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
  const definedAt = variable.mx?.definedAt;
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
  if (isEffectHookTarget(node)) {
    return (node as any).meta?.withClause;
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

function normalizeGuardNames(
  names: unknown,
  field: 'only' | 'except'
): Set<string> {
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

function applyGuardOverrideFilter(
  guards: GuardDefinition[],
  override: NormalizedGuardOverride
): GuardDefinition[] {
  if (override.kind === 'disableAll') {
    return guards.filter(def => def.privileged === true);
  }
  if (override.kind === 'only') {
    return guards.filter(def => def.privileged === true || (def.name && override.names?.has(def.name)));
  }
  if (override.kind === 'except') {
    return guards.filter(def => def.privileged === true || !def.name || !override.names?.has(def.name));
  }
  return guards;
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
        if (result.hint) {
          hints.push(result.hint);
        }
        if (result.decision === 'allow' && currentDecision === 'allow') {
          const replacements = normalizeGuardReplacements(result.replacement);
          if (replacements.length > 0) {
            transformedInputs.splice(0, transformedInputs.length, ...replacements);
            opSnapshot = buildOperationSnapshot(transformedInputs);
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

    const aggregateContext = buildAggregateGuardContext({
      decision: currentDecision,
      guardResults: guardTrace,
      hints,
      reasons,
      primaryMetadata
    });
  const aggregateMetadata = buildAggregateMetadata({
    guardResults: guardTrace,
    reasons,
    hints,
    transformedInputs,
    primaryMetadata,
    guardContext: aggregateContext
  });
    appendGuardHistory(env, operation, currentDecision, guardTrace, hints, reasons);
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
      decision: currentDecision,
      trace: guardTrace,
      hints,
      reasons,
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
          decision: currentDecision,
          operation: {
            type: operation?.type,
            subtype: operation?.subtype,
            name: operation?.name,
            labels: operation?.labels,
            metadata: operation?.metadata
          },
          inputs: inputPreview,
          reasons,
          hints: hints.map(h => (typeof h === 'string' ? h : h?.hint ?? h)),
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
                decision: currentDecision,
                operation: {
                  type: operation?.type,
                  subtype: operation?.subtype,
                  name: operation?.name,
                  labels: operation?.labels,
                  metadata: operation?.metadata
                },
                reasons,
                hints: hints.map(h => (typeof h === 'string' ? h : h?.hint ?? h)),
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

    if (currentDecision === 'allow') {
      for (const key of usedAttemptKeys) {
        clearGuardAttemptState(attemptStore, key);
      }
      return {
        action: 'continue',
        metadata: aggregateMetadata
      };
    }

    if (currentDecision === 'retry') {
      return {
        action: 'retry',
        metadata: aggregateMetadata
      };
    }

    return {
      action: 'abort',
      metadata: (() => {
        for (const key of usedAttemptKeys) {
          clearGuardAttemptState(attemptStore, key);
        }
        return aggregateMetadata;
      })()
    };
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
    const labels = Array.isArray(variable.mx?.labels) ? variable.mx.labels : [];
    const sources = Array.isArray(variable.mx?.sources) ? variable.mx.sources : [];
    const taint = Array.isArray(variable.mx?.taint) ? variable.mx.taint : [];

    const seen = new Set<string>();
    const guards: GuardDefinition[] = [];

    for (const label of labels) {
      const defs = registry.getDataGuardsForTiming(label, 'before');
      for (const def of defs) {
        if (!seen.has(def.id)) {
          seen.add(def.id);
          guards.push(def);
        }
      }
    }

    const filteredGuards = applyGuardOverrideFilter(guards, override);

    if (filteredGuards.length > 0) {
      results.push({ index, variable, labels, sources, taint, guards: filteredGuards });
    }
  }

  return results;
}

function collectOperationGuards(
  registry: ReturnType<Environment['getGuardRegistry']>,
  operation: OperationContext,
  override: NormalizedGuardOverride
): GuardDefinition[] {
  const keys = buildOperationKeys(operation);
  const seen = new Set<string>();
  const results: GuardDefinition[] = [];

  for (const key of keys) {
    const defs = registry.getOperationGuardsForTiming(key, 'before');
    for (const def of defs) {
      if (!seen.has(def.id)) {
        seen.add(def.id);
        results.push(def);
      }
    }
  }

  return applyGuardOverrideFilter(results, override);
}

function buildOperationSnapshot(inputs: readonly Variable[]): OperationSnapshot {
  const aggregate = buildArrayAggregate(inputs, { nameHint: '__guard_input__' });
  return {
    labels: aggregate.labels,
    sources: aggregate.sources,
    taint: aggregate.taint,
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
    operationLabels: operation.labels ?? []
  });

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
    inputPreview,
    outputPreview: buildVariablePreview(guardOutputVariable),
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
    const policyResult = guard.policyCondition({ operation });
    if (policyResult.decision === 'deny') {
      const metadataBase: Record<string, unknown> = {
        guardName: guard.name ?? null,
        guardFilter: `${guard.filterKind}:${guard.filterValue}`,
        scope,
        inputPreview,
        guardContext: contextSnapshotForMetadata,
        guardInput: inputVariable!,
        reason: policyResult.reason,
        decision: 'deny'
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
        metadata: metadataBase
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
        guardInput: inputVariable!
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
    guardInput: inputVariable
  };

  if (!action || action.decision === 'allow') {
    const replacement = await env.withGuardContext(guardContext, async () =>
      evaluateGuardReplacement(action, guardEnv, guard, inputVariable)
    );
    return {
      guardName: guard.name ?? null,
      decision: 'allow',
       timing: 'before',
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
        throw new MlldWhenExpressionError(
          `Cannot use += on undefined variable @${entry.identifier}. ` +
          `Use "let @${entry.identifier} = ..." first.`,
          entry.location
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
  if (!action || action.decision !== 'allow' || !action.value || action.value.length === 0) {
    return undefined;
  }
  const { evaluate } = await import('../core/interpreter');
  const result = await evaluate(action.value, guardEnv);
  const descriptor =
    inputVariable.mx && inputVariable.mx.labels
      ? varMxToSecurityDescriptor(inputVariable.mx)
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
  if (context.output !== undefined) {
    cloned.output = cloneGuardContextInput(context.output as any);
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
  guardContext?: GuardContextSnapshot;
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
