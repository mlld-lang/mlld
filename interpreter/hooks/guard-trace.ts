import type { GuardResult } from '@core/types/guard';
import type { Environment } from '@interpreter/env/Environment';
import {
  traceGuardAggregateDecision,
  traceGuardAggregateEvaluation,
  traceGuardEvent,
  type GuardTraceDecision,
  type GuardTracePhase
} from '@interpreter/tracing/events';

type GuardTraceEntryLike = Pick<GuardResult, 'decision'> & {
  guard?: {
    name?: string | null;
    filterKind?: string | null;
  } | null;
};

export function buildGuardTraceEmitter(
  env: Environment,
  base: {
    phase: GuardTracePhase;
    guard: string | null;
    operation: string | null;
    scope: string;
    attempt?: number;
    inputPreview?: unknown;
  }
): (
  event: 'guard.evaluate' | 'guard.allow' | 'guard.deny' | 'guard.retry' | 'guard.resume' | 'guard.env' | 'guard.crash',
  data?: Record<string, unknown>
) => void {
  return (event, data = {}) => {
    env.emitRuntimeTraceEvent(traceGuardEvent(event, base, data));
  };
}

export function emitAggregateGuardTrace(
  env: Environment,
  args: {
    phase: GuardTracePhase;
    guardTrace: readonly GuardTraceEntryLike[];
    decision: GuardTraceDecision;
    operation: string | null;
    reasons: unknown[];
    hints: readonly unknown[];
  }
): void {
  const guard = getAggregateGuardName(args.guardTrace);
  env.emitRuntimeTraceEvent(traceGuardAggregateEvaluation({
    phase: args.phase,
    guard,
    operation: args.operation,
    decision: args.decision,
    traceCount: args.guardTrace.length,
    decisionCounts: countGuardDecisions(args.guardTrace),
    reasons: [...args.reasons],
    hintCount: args.hints.length
  }));
  env.emitRuntimeTraceEvent(traceGuardAggregateDecision({
    phase: args.phase,
    guard,
    operation: args.operation,
    decision: args.decision,
    reasons: [...args.reasons],
    hints: args.hints.map(normalizeHintPayload)
  }));
}

export function getGuardTraceOperationName(operation: {
  named?: string | null;
  name?: string | null;
  type?: string | null;
}): string | null {
  return operation.named ?? operation.name ?? operation.type ?? null;
}

function getAggregateGuardName(guardTrace: readonly GuardTraceEntryLike[]): string | null {
  const firstGuard = guardTrace[0]?.guard;
  return firstGuard?.name ?? firstGuard?.filterKind ?? null;
}

function countGuardDecisions(guardTrace: readonly GuardTraceEntryLike[]): Record<string, number> {
  return guardTrace.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.decision] = (counts[entry.decision] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizeHintPayload(hint: unknown): unknown {
  if (hint && typeof hint === 'object' && 'hint' in hint) {
    return (hint as { hint?: unknown }).hint ?? null;
  }
  return hint ?? null;
}
