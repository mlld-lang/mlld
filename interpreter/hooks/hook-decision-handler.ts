import { GuardError } from '@core/errors/GuardError';
import type { HookDecision } from './HookManager';
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

export async function handleGuardDecision(
  decision: HookDecision,
  node: HookableNode,
  env: Environment,
  operationContext: OperationContext
): Promise<void> {
  if (!decision || decision.action === 'continue') {
    return;
  }

  const metadata = decision.metadata ?? {};
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
        : decision.action === 'abort' || decision.action === 'deny'
          ? 'Operation aborted by guard'
          : 'Guard requested retry'
    ,
    guardContext: metadata.guardContext as GuardContextSnapshot | undefined,
    guardInput: metadata.guardInput as Variable | readonly Variable[] | null | undefined
  };

  if (decision.action === 'abort' || decision.action === 'deny') {
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
      env
    });
  }

  if (decision.action === 'retry') {
    enforcePipelineGuardRetry(info, env, operationContext, node, {
      reasons: reasonsArray,
      guardResults,
      hints
    });
  }
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

  throw new GuardError({
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

function extractNodeLocation(node: HookableNode) {
  if (isDirectiveHookTarget(node)) {
    return node.location ?? null;
  }
  return node.location ?? null;
}
