import { GuardError } from '@core/errors/GuardError';
import type { HookDecision, HookDecisionAction } from './HookManager';
import type { HookableNode } from '@core/types/hooks';
import { isDirectiveHookTarget } from '@core/types/hooks';
import type { GuardHint, GuardResult, GuardScope } from '@core/types/guard';
import type { Environment } from '../env/Environment';
import type {
  OperationContext,
  PipelineContextSnapshot,
  GuardContextSnapshot
} from '../env/ContextManager';
import type { Variable } from '@core/types/variable';
import { isVariable } from '../utils/variable-resolution';
import { GuardRetrySignal } from '@core/errors/GuardRetrySignal';

const DEFAULT_GUARD_MAX = 3;

interface GuardDecisionInfo {
  guardName: string | null;
  guardFilter?: string;
  scope?: GuardScope;
  inputPreview?: string | null;
  retryHint?: string | null;
  baseMessage: string;
  guardContext?: GuardContextSnapshot;
  guardInput?: Variable | readonly Variable[] | null | unknown;
}

const CHECKPOINT_HIT_KEY = 'checkpointHit';
const CHECKPOINT_KEY_KEY = 'checkpointKey';
const CHECKPOINT_CACHED_RESULT_KEY = 'cachedResult';
const CHECKPOINT_INVOCATION_SITE_KEY = 'checkpointInvocationSite';
const CHECKPOINT_INVOCATION_INDEX_KEY = 'checkpointInvocationIndex';
const CHECKPOINT_INVOCATION_ORDINAL_KEY = 'checkpointInvocationOrdinal';

export interface CheckpointDecisionState {
  hit: boolean;
  key?: string;
  hasCachedResult: boolean;
  cachedResult?: unknown;
  invocationSite?: string;
  invocationIndex?: number;
  invocationOrdinal?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeHookDecision(decision: HookDecision): HookDecision {
  if (decision.action !== 'continue') {
    return decision;
  }

  const metadata = decision.metadata;
  if (!isRecord(metadata)) {
    return decision;
  }

  const checkpointHit = metadata[CHECKPOINT_HIT_KEY];
  const hasCachedResult = Object.prototype.hasOwnProperty.call(metadata, CHECKPOINT_CACHED_RESULT_KEY);
  if (checkpointHit === true && hasCachedResult) {
    return {
      action: 'fulfill',
      metadata
    };
  }

  return decision;
}

export function getNormalizedHookDecisionAction(decision: HookDecision): HookDecisionAction {
  return normalizeHookDecision(decision).action;
}

export function getCheckpointDecisionState(decision?: HookDecision): CheckpointDecisionState | null {
  if (!decision) {
    return null;
  }

  const normalizedDecision = normalizeHookDecision(decision);
  const metadata = isRecord(normalizedDecision.metadata) ? normalizedDecision.metadata : null;
  if (!metadata) {
    return null;
  }

  const hasCachedResult = Object.prototype.hasOwnProperty.call(metadata, CHECKPOINT_CACHED_RESULT_KEY);
  const hit = normalizedDecision.action === 'fulfill' || metadata[CHECKPOINT_HIT_KEY] === true;
  const key = typeof metadata[CHECKPOINT_KEY_KEY] === 'string' ? (metadata[CHECKPOINT_KEY_KEY] as string) : undefined;
  const invocationSite =
    typeof metadata[CHECKPOINT_INVOCATION_SITE_KEY] === 'string'
      ? (metadata[CHECKPOINT_INVOCATION_SITE_KEY] as string)
      : undefined;
  const invocationIndex =
    typeof metadata[CHECKPOINT_INVOCATION_INDEX_KEY] === 'number' &&
    Number.isInteger(metadata[CHECKPOINT_INVOCATION_INDEX_KEY] as number) &&
    (metadata[CHECKPOINT_INVOCATION_INDEX_KEY] as number) >= 0
      ? (metadata[CHECKPOINT_INVOCATION_INDEX_KEY] as number)
      : undefined;
  const invocationOrdinal =
    typeof metadata[CHECKPOINT_INVOCATION_ORDINAL_KEY] === 'number' &&
    Number.isInteger(metadata[CHECKPOINT_INVOCATION_ORDINAL_KEY] as number) &&
    (metadata[CHECKPOINT_INVOCATION_ORDINAL_KEY] as number) >= 0
      ? (metadata[CHECKPOINT_INVOCATION_ORDINAL_KEY] as number)
      : undefined;
  if (!hit && !key && !hasCachedResult) {
    return null;
  }

  return {
    hit,
    key,
    hasCachedResult,
    ...(hasCachedResult ? { cachedResult: metadata[CHECKPOINT_CACHED_RESULT_KEY] } : {}),
    ...(invocationSite ? { invocationSite } : {}),
    ...(invocationIndex !== undefined ? { invocationIndex } : {}),
    ...(invocationOrdinal !== undefined ? { invocationOrdinal } : {})
  };
}

export function applyCheckpointDecisionToOperation(
  operationContext: OperationContext,
  checkpointState: CheckpointDecisionState | null
): void {
  if (!checkpointState) {
    return;
  }

  const operationRef = operationContext as OperationContext & {
    metadata?: Record<string, unknown>;
  };
  if (!operationRef.metadata || typeof operationRef.metadata !== 'object') {
    operationRef.metadata = {};
  }
  const metadata = operationRef.metadata as Record<string, unknown>;
  metadata[CHECKPOINT_HIT_KEY] = checkpointState.hit;
  if (checkpointState.key) {
    metadata[CHECKPOINT_KEY_KEY] = checkpointState.key;
  } else {
    delete metadata[CHECKPOINT_KEY_KEY];
  }
  if (checkpointState.invocationSite) {
    metadata[CHECKPOINT_INVOCATION_SITE_KEY] = checkpointState.invocationSite;
  } else {
    delete metadata[CHECKPOINT_INVOCATION_SITE_KEY];
  }
  if (checkpointState.invocationIndex !== undefined) {
    metadata[CHECKPOINT_INVOCATION_INDEX_KEY] = checkpointState.invocationIndex;
  } else {
    delete metadata[CHECKPOINT_INVOCATION_INDEX_KEY];
  }
  if (checkpointState.invocationOrdinal !== undefined) {
    metadata[CHECKPOINT_INVOCATION_ORDINAL_KEY] = checkpointState.invocationOrdinal;
  } else {
    delete metadata[CHECKPOINT_INVOCATION_ORDINAL_KEY];
  }
  metadata.checkpoint = {
    hit: checkpointState.hit,
    key: checkpointState.key ?? null,
    invocationSite: checkpointState.invocationSite ?? null,
    invocationIndex: checkpointState.invocationIndex ?? null,
    invocationOrdinal: checkpointState.invocationOrdinal ?? null
  };
}

export async function handleGuardDecision(
  decision: HookDecision,
  node: HookableNode,
  env: Environment,
  operationContext: OperationContext
): Promise<void> {
  if (!decision) {
    return;
  }

  const normalizedDecision = normalizeHookDecision(decision);
  if (normalizedDecision.action === 'continue' || normalizedDecision.action === 'fulfill') {
    return;
  }

  const metadata = normalizedDecision.metadata ?? {};
  const guardName =
    typeof metadata.guardName === 'string' || metadata.guardName === null
      ? (metadata.guardName as string | null)
      : null;
  const reasonsArray = Array.isArray((metadata as any).reasons)
    ? ((metadata as any).reasons as string[])
    : undefined;
  const guardResults = Array.isArray((metadata as any).guardResults)
    ? ((metadata as any).guardResults as GuardResult[])
    : undefined;
  const hints = Array.isArray((metadata as any).hints)
    ? ((metadata as any).hints as GuardHint[])
    : undefined;
  const guardContextSnapshot = buildGuardContextFromMetadata(
    metadata as Record<string, unknown>,
    reasonsArray,
    guardResults,
    hints
  );
  const primaryReason =
    (typeof (metadata as any).reason === 'string'
      ? (metadata as any).reason
      : undefined) ?? (reasonsArray && reasonsArray.length > 0 ? reasonsArray[0] : undefined);
  const info: GuardDecisionInfo = {
    guardName,
    guardFilter: typeof metadata.guardFilter === 'string' ? metadata.guardFilter : undefined,
    scope: metadata.scope as GuardScope | undefined,
    inputPreview:
      typeof metadata.inputPreview === 'string' ? metadata.inputPreview : undefined,
    retryHint: typeof metadata.hint === 'string' ? metadata.hint : undefined,
    baseMessage:
      primaryReason && primaryReason.length > 0
        ? primaryReason
        : normalizedDecision.action === 'abort' || normalizedDecision.action === 'deny'
          ? 'Operation aborted by guard'
          : 'Guard requested retry'
    ,
    guardContext: guardContextSnapshot,
    guardInput: metadata.guardInput as Variable | readonly Variable[] | null | undefined
  };

  const policyName = typeof (metadata as any).policyName === 'string' ? (metadata as any).policyName : null;
  const policyRule = typeof (metadata as any).policyRule === 'string' ? (metadata as any).policyRule : null;
  const policySuggestions = Array.isArray((metadata as any).policySuggestions)
    ? ((metadata as any).policySuggestions as string[])
    : undefined;

  if (normalizedDecision.action === 'abort' || normalizedDecision.action === 'deny') {
    throw new GuardError({
      decision: 'deny',
      guardName: info.guardName,
      guardFilter: info.guardFilter,
      scope: info.scope,
      inputPreview: info.inputPreview ?? null,
      retryHint: info.retryHint,
      operation: operationContext,
      reason: info.baseMessage,
      guardContext: info.guardContext,
      guardInput: info.guardInput ?? null,
      reasons: reasonsArray,
      guardResults,
      hints,
      sourceLocation: extractNodeLocation(node),
      env,
      policyName,
      policyRule,
      policySuggestions
    });
  }

  if (normalizedDecision.action === 'retry') {
    enforcePipelineGuardRetry(info, env, operationContext, node, {
      reasons: reasonsArray,
      guardResults,
      hints
    });
  }
}

export function getGuardTransformedInputs(
  decision: HookDecision | undefined,
  originalInputs?: readonly unknown[]
): readonly Variable[] | undefined {
  if (!decision?.metadata) {
    return undefined;
  }
  const candidates = (decision.metadata as Record<string, unknown>).transformedInputs;
  if (!Array.isArray(candidates)) {
    return undefined;
  }

  const variables = candidates.filter(isVariable) as Variable[];
  if (variables.length !== candidates.length) {
    return undefined;
  }

  if (!originalInputs || originalInputs.length === 0) {
    return variables;
  }

  return alignTransformedInputs(variables, originalInputs);
}

function enforcePipelineGuardRetry(
  info: GuardDecisionInfo,
  env: Environment,
  operationContext: OperationContext,
  node: HookableNode,
  extras?: {
    reasons?: string[];
    guardResults?: GuardResult[];
    hints?: GuardHint[];
  }
): never {
  const pipelineContext = env.getPipelineContext();
  if (!pipelineContext) {
    throw new GuardError({
      decision: 'deny',
      guardName: info.guardName,
      guardFilter: info.guardFilter,
      scope: info.scope,
      inputPreview: info.inputPreview ?? null,
      retryHint: info.retryHint,
      operation: operationContext,
      guardContext: info.guardContext,
      guardInput: info.guardInput ?? null,
      reasons: extras?.reasons,
      guardResults: extras?.guardResults,
      hints: extras?.hints,
      reason: 'guard retry requires pipeline context (non-pipeline retry deferred to Phase 7.3)',
      sourceLocation: extractNodeLocation(node),
      env
    });
  }

  if (!canRetryWithinPipeline(pipelineContext)) {
    throw new GuardError({
      decision: 'deny',
      guardName: info.guardName,
      guardFilter: info.guardFilter,
      scope: info.scope,
      inputPreview: info.inputPreview ?? null,
      retryHint: info.retryHint,
      operation: operationContext,
      guardContext: info.guardContext,
      guardInput: info.guardInput ?? null,
      reasons: extras?.reasons,
      guardResults: extras?.guardResults,
      hints: extras?.hints,
      reason: `Cannot retry: ${info.retryHint ?? 'guard requested retry'} (source not retryable)`,
      sourceLocation: extractNodeLocation(node),
      env
    });
  }

  throw new GuardRetrySignal({
    decision: 'retry',
    guardName: info.guardName,
    guardFilter: info.guardFilter,
    scope: info.scope,
    inputPreview: info.inputPreview ?? null,
    retryHint: info.retryHint,
    operation: operationContext,
    guardContext: info.guardContext,
    guardInput: info.guardInput ?? null,
    reasons: extras?.reasons,
    guardResults: extras?.guardResults,
    hints: extras?.hints,
    reason: info.baseMessage,
    sourceLocation: extractNodeLocation(node),
    env
  });
}

function canRetryWithinPipeline(context: PipelineContextSnapshot): boolean {
  if (!context.sourceRetryable) {
    return false;
  }
  return true;
}

function buildGuardContextFromMetadata(
  metadata: Record<string, unknown>,
  reasons?: string[],
  guardResults?: GuardResult[],
  hints?: GuardHint[]
): GuardContextSnapshot {
  const baseContext = (metadata.guardContext as GuardContextSnapshot | undefined) ?? {};
  const trace =
    guardResults ?? (Array.isArray((baseContext as any).trace) ? (baseContext as any).trace : []);
  const hintList =
    hints ?? (Array.isArray((baseContext as any).hints) ? (baseContext as any).hints : []);
  const reasonList =
    reasons ??
    (Array.isArray((baseContext as any).reasons) ? ((baseContext as any).reasons as string[]) : []);
  const attempt =
    typeof baseContext.attempt === 'number'
      ? baseContext.attempt
      : typeof baseContext.try === 'number'
        ? baseContext.try ?? 0
        : 0;
  const max = typeof baseContext.max === 'number' ? baseContext.max : DEFAULT_GUARD_MAX;
  const resolvedReason =
    baseContext.reason ??
    (typeof metadata.reason === 'string' ? metadata.reason : undefined) ??
    reasonList[0] ??
    null;

  return {
    ...baseContext,
    trace,
    hints: hintList,
    reasons: reasonList,
    reason: resolvedReason,
    attempt,
    try: typeof baseContext.try === 'number' ? baseContext.try : attempt,
    max
  };
}

function extractNodeLocation(node: HookableNode) {
  if (isDirectiveHookTarget(node)) {
    return node.location ?? null;
  }
  return node.location ?? null;
}

function alignTransformedInputs(
  transformed: readonly Variable[],
  originals: readonly unknown[]
): Variable[] {
  const aligned: Variable[] = [];
  const limit = Math.min(transformed.length, originals.length);
  for (let i = 0; i < limit; i++) {
    const replacement = transformed[i];
    const original = originals[i];
    if (isVariable(original) && original.name !== replacement.name) {
      const cloned: Variable = {
        ...replacement,
        name: original.name,
        mx: replacement.mx ? { ...replacement.mx } : undefined,
        internal: replacement.internal ? { ...replacement.internal } : undefined
      };
      if (cloned.mx?.mxCache) {
        delete cloned.mx.mxCache;
      }
      aligned.push(cloned);
    } else {
      aligned.push(replacement);
    }
  }

  for (let i = limit; i < transformed.length; i++) {
    aligned.push(transformed[i]);
  }

  return aligned;
}
