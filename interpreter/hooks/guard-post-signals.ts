import type { GuardHint, GuardResult } from '@core/types/guard';
import { GuardError } from '@core/errors/GuardError';
import { GuardRetrySignal } from '@core/errors/GuardRetrySignal';
import type { OperationContext, GuardContextSnapshot } from '../env/ContextManager';

interface GuardSignalContext {
  guardName: string | null;
  guardFilter?: string;
  scope?: string;
  inputPreview?: string;
  guardContext?: GuardContextSnapshot;
}

function buildSignalContext(guardResults: GuardResult[]): GuardSignalContext {
  return {
    guardName: guardResults[0]?.guardName ?? null,
    guardFilter: guardResults[0]?.metadata?.guardFilter as string | undefined,
    scope: guardResults[0]?.metadata?.scope as string | undefined,
    inputPreview: guardResults[0]?.metadata?.inputPreview as string | undefined,
    guardContext: guardResults[0]?.metadata?.guardContext as GuardContextSnapshot | undefined
  };
}

interface PostGuardErrorOptions {
  guardResults: GuardResult[];
  reasons: string[];
  operation: OperationContext;
  outputPreview?: string | null;
  timing: 'after';
  retry?: boolean;
}

export function buildPostGuardError(options: PostGuardErrorOptions): GuardError {
  const primaryReason = options.reasons[0] ?? 'Guard blocked operation';
  const context = buildSignalContext(options.guardResults);
  return new GuardError({
    decision: options.retry ? 'retry' : 'deny',
    guardName: context.guardName,
    guardFilter: context.guardFilter,
    scope: context.scope,
    operation: options.operation,
    inputPreview: context.inputPreview,
    outputPreview: options.outputPreview ?? null,
    reasons: options.reasons,
    guardResults: options.guardResults,
    hints: options.guardResults.flatMap(entry => (entry.hint ? [entry.hint] : [])),
    timing: 'after',
    reason: primaryReason,
    guardContext: context.guardContext
  });
}

interface NonRetryableRetryErrorOptions {
  guardResults: GuardResult[];
  reasons: string[];
  hints: GuardHint[];
  operation: OperationContext;
  outputPreview?: string | null;
  retryHint?: string | null;
}

export function buildPostRetryDeniedError(options: NonRetryableRetryErrorOptions): GuardError {
  const context = buildSignalContext(options.guardResults);
  const reason = `Cannot retry: ${options.retryHint ?? 'guard requested retry'} (source not retryable)`;
  return new GuardError({
    decision: 'deny',
    guardName: context.guardName,
    guardFilter: context.guardFilter,
    scope: context.scope,
    operation: options.operation,
    inputPreview: context.inputPreview,
    outputPreview: options.outputPreview ?? null,
    reasons: options.reasons,
    guardResults: options.guardResults,
    hints: options.hints,
    retryHint: options.retryHint ?? null,
    reason,
    timing: 'after'
  });
}

interface RetrySignalOptions {
  guardResults: GuardResult[];
  reasons: string[];
  hints?: GuardHint[];
  operation: OperationContext;
  outputPreview?: string | null;
  retryHint?: string | null;
}

export function buildPostGuardRetrySignal(options: RetrySignalOptions): GuardRetrySignal {
  const primaryReason = options.reasons[0] ?? 'Guard requested retry';
  const context = buildSignalContext(options.guardResults);
  return new GuardRetrySignal({
    guardName: context.guardName,
    guardFilter: context.guardFilter,
    scope: context.scope,
    operation: options.operation,
    inputPreview: context.inputPreview,
    outputPreview: options.outputPreview ?? null,
    reasons: options.reasons,
    guardResults: options.guardResults,
    hints: options.hints ?? options.guardResults.flatMap(entry => (entry.hint ? [entry.hint] : [])),
    timing: 'after',
    retryHint: options.retryHint ?? null,
    reason: primaryReason,
    guardContext: context.guardContext
  });
}
