import type { OperationContext, PipelineContextSnapshot } from '../env/ContextManager';
import type { Environment } from '../env/Environment';

const DEFAULT_GUARD_MAX = 3;

interface GuardRetryRuntimeContext {
  attempt?: number;
  tries?: Array<{ attempt?: number; decision?: string; hint?: string | null }>;
  hintHistory?: Array<string | null>;
  max?: number;
  nextAction?: {
    decision?: string;
    hint?: string | null;
    details?: Record<string, unknown>;
  };
}

export interface GuardRetryContextSnapshot {
  attempt: number;
  tries: Array<{ attempt: number; decision: string; hint?: string | null }>;
  hintHistory: Array<string | null>;
  max: number;
}

export interface GuardNextActionSnapshot {
  decision: 'retry' | 'resume';
  hint: string | null;
  details?: Record<string, unknown>;
}

export function getGuardRetryContext(env: Environment): GuardRetryContextSnapshot {
  const context = env
    .getContextManager()
    .peekGenericContext('guardRetry') as GuardRetryRuntimeContext | undefined;

  const attempt = typeof context?.attempt === 'number' && context.attempt > 0 ? context.attempt : 1;
  const tries = Array.isArray(context?.tries)
    ? context.tries.map(entry => ({
        attempt: typeof entry.attempt === 'number' ? entry.attempt : attempt,
        decision: typeof entry.decision === 'string' ? entry.decision : 'retry',
        hint: typeof entry.hint === 'string' || entry.hint === null ? entry.hint : null
      }))
    : [];
  const hintHistory = Array.isArray(context?.hintHistory)
    ? context.hintHistory.map(value =>
        typeof value === 'string' || value === null ? value : String(value ?? '')
      )
    : tries.map(entry => entry.hint ?? null);
  const max =
    typeof context?.max === 'number' && context.max > 0 ? context.max : DEFAULT_GUARD_MAX;

  return { attempt, tries, hintHistory, max };
}

export function getGuardNextAction(env: Environment): GuardNextActionSnapshot | null {
  const context = env
    .getContextManager()
    .peekGenericContext('guardRetry') as GuardRetryRuntimeContext | undefined;
  const decision = context?.nextAction?.decision;
  if (decision !== 'retry' && decision !== 'resume') {
    return null;
  }

  return {
    decision,
    hint:
      typeof context?.nextAction?.hint === 'string' || context?.nextAction?.hint === null
        ? context.nextAction.hint
        : null,
    details:
      context?.nextAction?.details && typeof context.nextAction.details === 'object'
        ? { ...(context.nextAction.details as Record<string, unknown>) }
        : undefined
  };
}

export interface RetryEnforcementResult {
  sourceRetryable: boolean;
  denyRetry: boolean;
}

export interface ResumeEnforcementResult {
  allowResume: boolean;
}

export function evaluateRetryEnforcement(
  operation: OperationContext,
  pipelineContext: PipelineContextSnapshot | null
): RetryEnforcementResult {
  const sourceRetryable =
    pipelineContext?.sourceRetryable ??
    Boolean(operation?.metadata && (operation.metadata as any).sourceRetryable);

  return {
    sourceRetryable,
    denyRetry: Boolean(pipelineContext && !sourceRetryable)
  };
}

export function evaluateResumeEnforcement(
  operation: OperationContext,
  pipelineContext: PipelineContextSnapshot | null
): ResumeEnforcementResult {
  if (pipelineContext) {
    return { allowResume: false };
  }

  const metadata =
    operation?.metadata && typeof operation.metadata === 'object'
      ? (operation.metadata as Record<string, unknown>)
      : null;
  const resumeState =
    metadata?.llmResumeState && typeof metadata.llmResumeState === 'object'
      ? (metadata.llmResumeState as Record<string, unknown>)
      : null;

  const allowResume =
    metadata?.llmResumeEligible === true &&
    typeof resumeState?.sessionId === 'string' &&
    resumeState.sessionId.trim().length > 0 &&
    typeof resumeState?.provider === 'string' &&
    resumeState.provider.trim().length > 0;

  return { allowResume };
}
