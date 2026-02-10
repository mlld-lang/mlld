import type { OperationContext, PipelineContextSnapshot } from '../env/ContextManager';
import type { Environment } from '../env/Environment';

const DEFAULT_GUARD_MAX = 3;

interface GuardRetryRuntimeContext {
  attempt?: number;
  tries?: Array<{ attempt?: number; decision?: string; hint?: string | null }>;
  hintHistory?: Array<string | null>;
  max?: number;
}

export interface GuardRetryContextSnapshot {
  attempt: number;
  tries: Array<{ attempt: number; decision: string; hint?: string | null }>;
  hintHistory: Array<string | null>;
  max: number;
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

export interface RetryEnforcementResult {
  sourceRetryable: boolean;
  denyRetry: boolean;
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
