import type { GuardHint, GuardResult } from '@core/types/guard';
import type { Variable } from '@core/types/variable';
import type { GuardContextSnapshot } from '../env/ContextManager';
import { DEFAULT_GUARD_MAX } from './guard-pre-runtime';

export function buildAggregateMetadata(options: {
  guardResults: GuardResult[];
  reasons?: string[];
  hints?: GuardHint[];
  transformedInputs?: readonly Variable[];
  primaryMetadata?: Record<string, unknown> | undefined;
  guardContext?: GuardContextSnapshot;
  envConfig?: unknown;
  envGuard?: string | null;
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

  if (options.envConfig !== undefined) {
    metadata.envConfig = options.envConfig;
    if (options.envGuard !== undefined) {
      metadata.envGuard = options.envGuard;
    }
  }

  if (!metadata.reason && options.reasons && options.reasons.length > 0) {
    metadata.reason = options.reasons[0];
  }

  return metadata;
}

export function buildAggregateGuardContext(options: {
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
