import type {
  RuntimeTraceCategory,
  RuntimeTraceEmissionLevel,
  RuntimeTraceEventName,
  RuntimeTraceEventSpecMap,
  RuntimeTraceScope
} from '@core/types/trace';

export interface RuntimeTraceEnvelope<K extends RuntimeTraceEventName = RuntimeTraceEventName> {
  requiredLevel: RuntimeTraceEventSpecMap[K]['level'];
  category: RuntimeTraceEventSpecMap[K]['category'];
  event: K;
  data: RuntimeTraceEventSpecMap[K]['data'];
  scope?: Partial<RuntimeTraceScope>;
}

export type GuardTracePhase = 'before' | 'after';
export type GuardTraceDecision = 'allow' | 'deny' | 'retry' | 'resume' | 'env';

interface GuardTraceBase {
  phase: GuardTracePhase;
  guard: string | null;
  operation: string | null;
  scope: string;
  attempt?: number;
  inputPreview?: unknown;
}

function createRuntimeTraceEnvelope<K extends RuntimeTraceEventName>(
  requiredLevel: RuntimeTraceEventSpecMap[K]['level'],
  category: RuntimeTraceEventSpecMap[K]['category'],
  event: K,
  data: RuntimeTraceEventSpecMap[K]['data'],
  scope?: Partial<RuntimeTraceScope>
): RuntimeTraceEnvelope<K> {
  return {
    requiredLevel,
    category,
    event,
    data,
    ...(scope ? { scope } : {})
  };
}

export function traceHandleIssued(data: RuntimeTraceEventSpecMap['handle.issued']['data']): RuntimeTraceEnvelope<'handle.issued'> {
  return createRuntimeTraceEnvelope('verbose', 'handle', 'handle.issued', data);
}

export function traceSessionSeed(
  data: RuntimeTraceEventSpecMap['session.seed']['data']
): RuntimeTraceEnvelope<'session.seed'> {
  return createRuntimeTraceEnvelope('effects', 'session', 'session.seed', data);
}

export function traceSessionWrite(
  data: RuntimeTraceEventSpecMap['session.write']['data']
): RuntimeTraceEnvelope<'session.write'> {
  return createRuntimeTraceEnvelope('effects', 'session', 'session.write', data);
}

export function traceSessionFinal(
  data: RuntimeTraceEventSpecMap['session.final']['data']
): RuntimeTraceEnvelope<'session.final'> {
  return createRuntimeTraceEnvelope('effects', 'session', 'session.final', data);
}

export function traceImportEvent<K extends 'import.resolve' | 'import.cache_hit' | 'import.read' | 'import.parse' | 'import.evaluate' | 'import.exports'>(
  event: K,
  data: RuntimeTraceEventSpecMap[K]['data']
): RuntimeTraceEnvelope<K> {
  return createRuntimeTraceEnvelope('verbose', 'import', event, data);
}

export function traceImportFailure(
  data: RuntimeTraceEventSpecMap['import.fail']['data']
): RuntimeTraceEnvelope<'import.fail'> {
  return createRuntimeTraceEnvelope('effects', 'import', 'import.fail', data);
}

export function traceHandleResolved(data: RuntimeTraceEventSpecMap['handle.resolved']['data']): RuntimeTraceEnvelope<'handle.resolved'> {
  return createRuntimeTraceEnvelope('verbose', 'handle', 'handle.resolved', data);
}

export function traceHandleResolveFailed(data: RuntimeTraceEventSpecMap['handle.resolve_failed']['data']): RuntimeTraceEnvelope<'handle.resolve_failed'> {
  return createRuntimeTraceEnvelope('verbose', 'handle', 'handle.resolve_failed', data);
}

export function traceHandleReleased(data: RuntimeTraceEventSpecMap['handle.released']['data']): RuntimeTraceEnvelope<'handle.released'> {
  return createRuntimeTraceEnvelope('verbose', 'handle', 'handle.released', data);
}

export function traceShelfRead(data: RuntimeTraceEventSpecMap['shelf.read']['data']): RuntimeTraceEnvelope<'shelf.read'> {
  return createRuntimeTraceEnvelope('verbose', 'shelf', 'shelf.read', data);
}

export function traceShelfWrite(data: {
  slot: string;
  action?: string;
  success?: boolean;
  value: unknown;
  event?: 'shelf.write' | 'shelf.remove';
  traceData?: Record<string, unknown>;
}): RuntimeTraceEnvelope<'shelf.write'> | RuntimeTraceEnvelope<'shelf.remove'> {
  const {
    event = 'shelf.write',
    action = 'write',
    success = true,
    traceData,
    ...rest
  } = data;
  return createRuntimeTraceEnvelope('effects', 'shelf', event, {
    ...rest,
    action,
    success,
    ...(traceData ?? {})
  });
}

export function traceShelfClear(data: RuntimeTraceEventSpecMap['shelf.clear']['data']): RuntimeTraceEnvelope<'shelf.clear'> {
  return createRuntimeTraceEnvelope('effects', 'shelf', 'shelf.clear', {
    action: 'clear',
    ...data
  });
}

export function traceShelfStaleRead(data: RuntimeTraceEventSpecMap['shelf.stale_read']['data']): RuntimeTraceEnvelope<'shelf.stale_read'> {
  return createRuntimeTraceEnvelope('effects', 'shelf', 'shelf.stale_read', data);
}

export function traceGuardEvent(
  event: 'guard.evaluate' | 'guard.allow' | 'guard.deny' | 'guard.retry' | 'guard.resume' | 'guard.env' | 'guard.crash',
  base: GuardTraceBase,
  data: Record<string, unknown> = {}
): RuntimeTraceEnvelope {
  return createRuntimeTraceEnvelope('effects', 'guard', event, {
    ...base,
    ...data
  });
}

export function traceGuardAggregateEvaluation(data: RuntimeTraceEventSpecMap['guard.evaluate']['data'] & {
  phase: GuardTracePhase;
  guard: string | null;
  operation: string | null;
  decision: GuardTraceDecision;
  traceCount: number;
  decisionCounts: Record<string, number>;
  reasons: unknown[];
  hintCount: number;
}): RuntimeTraceEnvelope<'guard.evaluate'> {
  return createRuntimeTraceEnvelope('effects', 'guard', 'guard.evaluate', data);
}

export function traceGuardAggregateDecision(data: {
  phase: GuardTracePhase;
  guard: string | null;
  operation: string | null;
  decision: GuardTraceDecision;
  reasons: unknown[];
  hints: unknown[];
}): RuntimeTraceEnvelope<'guard.allow'> | RuntimeTraceEnvelope<'guard.deny'> | RuntimeTraceEnvelope<'guard.retry'> | RuntimeTraceEnvelope<'guard.resume'> | RuntimeTraceEnvelope<'guard.env'> {
  return createRuntimeTraceEnvelope('effects', 'guard', `guard.${data.decision}`, data);
}

export function tracePolicyEvent<K extends 'policy.build' | 'policy.validate' | 'policy.compile_drop' | 'policy.compile_repair'>(
  level: RuntimeTraceEventSpecMap[K]['level'],
  event: K,
  data: RuntimeTraceEventSpecMap[K]['data']
): RuntimeTraceEnvelope<K> {
  return createRuntimeTraceEnvelope(level, 'policy', event, data);
}

export function traceProofEvent(
  data: RuntimeTraceEventSpecMap['proof.lifted']['data']
): RuntimeTraceEnvelope<'proof.lifted'> {
  return createRuntimeTraceEnvelope('verbose', 'proof', 'proof.lifted', data);
}

export function tracePolicyError(data: RuntimeTraceEventSpecMap['policy.error']['data']): RuntimeTraceEnvelope<'policy.error'> {
  return createRuntimeTraceEnvelope('effects', 'policy', 'policy.error', data);
}

export function traceAuthCheck(data: RuntimeTraceEventSpecMap['auth.check']['data']): RuntimeTraceEnvelope<'auth.check'> {
  return createRuntimeTraceEnvelope('effects', 'auth', 'auth.check', data);
}

export function traceAuthDecision<K extends 'allow' | 'deny'>(
  decision: K,
  data: RuntimeTraceEventSpecMap[`auth.${K}`]['data']
): RuntimeTraceEnvelope<`auth.${K}`> {
  return createRuntimeTraceEnvelope('effects', 'auth', `auth.${decision}` as `auth.${K}`, data);
}

export function traceDisplayProject(data: RuntimeTraceEventSpecMap['display.project']['data']): RuntimeTraceEnvelope<'display.project'> {
  return createRuntimeTraceEnvelope('verbose', 'display', 'display.project', data);
}

export function traceLlmToolCall(
  data: Omit<RuntimeTraceEventSpecMap['llm.tool_call']['data'], 'phase'>
): RuntimeTraceEnvelope<'llm.tool_call'> {
  return createRuntimeTraceEnvelope('verbose', 'llm', 'llm.tool_call', {
    phase: 'start',
    ...data
  });
}

export function traceLlmToolResult(
  data: Omit<RuntimeTraceEventSpecMap['llm.tool_result']['data'], 'phase'>
): RuntimeTraceEnvelope<'llm.tool_result'> {
  return createRuntimeTraceEnvelope('verbose', 'llm', 'llm.tool_result', {
    phase: 'finish',
    ...data
  });
}

export function traceLlmInvocation(
  event: 'llm.call' | 'llm.resume',
  data: {
    sessionId?: string;
    provider?: string;
    model?: string;
    toolCount?: number;
    resume: boolean;
    ok: boolean;
    error?: string;
    durationMs?: number;
  }
): RuntimeTraceEnvelope<'llm.call'> | RuntimeTraceEnvelope<'llm.resume'> {
  return createRuntimeTraceEnvelope('verbose', 'llm', event, {
    phase: 'finish',
    ...data
  });
}

export function traceMcpRequest(
  data: Omit<RuntimeTraceEventSpecMap['mcp.request']['data'], 'phase'>
): RuntimeTraceEnvelope<'mcp.request'> {
  return createRuntimeTraceEnvelope('verbose', 'mcp', 'mcp.request', {
    phase: 'start',
    ...data
  });
}

export function traceMcpResponse(
  data: Omit<RuntimeTraceEventSpecMap['mcp.response']['data'], 'phase'>
): RuntimeTraceEnvelope<'mcp.response'> {
  return createRuntimeTraceEnvelope('verbose', 'mcp', 'mcp.response', {
    phase: 'finish',
    ...data
  });
}

export function traceMcpProgress(
  data: Omit<RuntimeTraceEventSpecMap['mcp.progress']['data'], 'phase'>
): RuntimeTraceEnvelope<'mcp.progress'> {
  return createRuntimeTraceEnvelope('verbose', 'mcp', 'mcp.progress', {
    phase: 'progress',
    ...data
  });
}

export function traceMemoryEvent<K extends 'memory.sample' | 'memory.delta' | 'memory.gc' | 'memory.pressure' | 'memory.summary'>(
  level: RuntimeTraceEventSpecMap[K]['level'],
  event: K,
  data: RuntimeTraceEventSpecMap[K]['data']
): RuntimeTraceEnvelope<K> {
  return createRuntimeTraceEnvelope(level, 'memory', event, data);
}

export function traceRecordSchemaFail(data: RuntimeTraceEventSpecMap['record.schema_fail']['data']): RuntimeTraceEnvelope<'record.schema_fail'> {
  return createRuntimeTraceEnvelope('effects', 'record', 'record.schema_fail', data);
}

export function traceRecordCoerce(data: RuntimeTraceEventSpecMap['record.coerce']['data']): RuntimeTraceEnvelope<'record.coerce'> {
  return createRuntimeTraceEnvelope('verbose', 'record', 'record.coerce', data);
}
