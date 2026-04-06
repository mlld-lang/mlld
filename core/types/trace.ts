/**
 * Simple directive trace for debugging mlld execution paths
 */
export interface DirectiveTrace {
  /** The directive type (e.g., '@text', '@data', '@import') */
  directive: string;
  
  /** Optional variable or exec name associated with the directive */
  varName?: string;
  
  /** File location in format 'filename.mld:line' */
  location: string;
  
  /** Nesting depth for display formatting */
  depth: number;
  
  /** Whether this directive failed (for imports) */
  failed?: boolean;
  
  /** Error message if failed */
  errorMessage?: string;
}

export const RUNTIME_TRACE_LEVELS = ['off', 'effects', 'verbose'] as const;

export type RuntimeTraceLevel = (typeof RUNTIME_TRACE_LEVELS)[number];
export type RuntimeTraceEmissionLevel = Exclude<RuntimeTraceLevel, 'off'>;

export type RuntimeTraceCategory =
  | 'shelf'
  | 'guard'
  | 'handle'
  | 'policy'
  | 'auth'
  | 'display'
  | 'llm'
  | 'record';

type TraceRecord<T extends object> = T & Record<string, unknown>;

export type RuntimeTraceEventName =
  | 'shelf.read'
  | 'shelf.write'
  | 'shelf.clear'
  | 'shelf.remove'
  | 'shelf.stale_read'
  | 'guard.evaluate'
  | 'guard.allow'
  | 'guard.deny'
  | 'guard.retry'
  | 'guard.resume'
  | 'guard.env'
  | 'guard.crash'
  | 'handle.mint'
  | 'handle.resolve'
  | 'handle.resolve_fail'
  | 'policy.build'
  | 'policy.validate'
  | 'policy.compile_drop'
  | 'policy.compile_repair'
  | 'auth.check'
  | 'auth.allow'
  | 'auth.deny'
  | 'display.project'
  | 'llm.call'
  | 'llm.resume'
  | 'llm.tool_call'
  | 'llm.tool_result'
  | 'record.coerce'
  | 'record.schema_fail';

export interface RuntimeTraceScope {
  exe?: string;
  operation?: string;
  box?: string;
  guard_try?: number;
  pipeline_stage?: number;
  [key: string]: unknown;
}

export interface RuntimeTraceEventSpecMap {
  'shelf.read': {
    category: 'shelf';
    level: 'verbose';
    data: TraceRecord<{ slot: string; found: boolean; value?: unknown }>;
  };
  'shelf.write': {
    category: 'shelf';
    level: 'effects';
    data: TraceRecord<{ slot: string; action: string; success: boolean; value?: unknown }>;
  };
  'shelf.clear': {
    category: 'shelf';
    level: 'effects';
    data: TraceRecord<{ slot: string; action: string; success: boolean }>;
  };
  'shelf.remove': {
    category: 'shelf';
    level: 'effects';
    data: TraceRecord<{ slot: string; action: string; success: boolean; value?: unknown }>;
  };
  'shelf.stale_read': {
    category: 'shelf';
    level: 'effects';
    data: TraceRecord<{
      slot: string;
      writeTs: string;
      readTs: string;
      expected: unknown;
      actual: unknown;
      message: string;
    }>;
  };
  'guard.evaluate': {
    category: 'guard';
    level: 'effects';
    data: TraceRecord<{
      phase: 'before' | 'after';
      guard: string | null;
      operation: string | null;
      scope?: string;
      attempt?: number;
      inputPreview?: unknown;
    }>;
  };
  'guard.allow': RuntimeTraceEventSpecMap['guard.evaluate'];
  'guard.deny': RuntimeTraceEventSpecMap['guard.evaluate'];
  'guard.retry': RuntimeTraceEventSpecMap['guard.evaluate'];
  'guard.resume': RuntimeTraceEventSpecMap['guard.evaluate'];
  'guard.env': RuntimeTraceEventSpecMap['guard.evaluate'];
  'guard.crash': RuntimeTraceEventSpecMap['guard.evaluate'];
  'handle.mint': {
    category: 'handle';
    level: 'verbose';
    data: TraceRecord<{ handle: string; value?: unknown }>;
  };
  'handle.resolve': {
    category: 'handle';
    level: 'verbose';
    data: TraceRecord<{ handle: string; value?: unknown }>;
  };
  'handle.resolve_fail': {
    category: 'handle';
    level: 'verbose';
    data: TraceRecord<{ handle: string; reason?: string }>;
  };
  'policy.build': {
    category: 'policy';
    level: 'effects';
    data: TraceRecord<{
      mode: string;
      toolCount: number;
      valid: boolean;
      issueCount: number;
      repairedArgCount: number;
      droppedEntryCount: number;
      droppedArrayElementCount: number;
    }>;
  };
  'policy.validate': RuntimeTraceEventSpecMap['policy.build'];
  'policy.compile_drop': {
    category: 'policy';
    level: 'effects';
    data: TraceRecord<{ mode: string; droppedEntries: unknown; droppedArrayElements: unknown }>;
  };
  'policy.compile_repair': {
    category: 'policy';
    level: 'verbose';
    data: TraceRecord<{ mode: string; repairedArgs: unknown[] }>;
  };
  'auth.check': {
    category: 'auth';
    level: 'effects';
    data: TraceRecord<{ tool: string; args: unknown }>;
  };
  'auth.allow': {
    category: 'auth';
    level: 'effects';
    data: TraceRecord<{ tool: string }>;
  };
  'auth.deny': RuntimeTraceEventSpecMap['auth.allow'];
  'display.project': {
    category: 'display';
    level: 'verbose';
    data: TraceRecord<{
      record: string;
      field: string;
      mode: string;
      handleIssued?: boolean;
      handleCount?: number;
      elementCount?: number;
    }>;
  };
  'llm.call': {
    category: 'llm';
    level: 'verbose';
    data: TraceRecord<{
      phase: 'finish';
      sessionId?: string;
      provider?: string;
      model?: string;
      toolCount?: number;
      resume: boolean;
      ok: boolean;
      error?: string;
      durationMs?: number;
    }>;
  };
  'llm.resume': RuntimeTraceEventSpecMap['llm.call'];
  'llm.tool_call': {
    category: 'llm';
    level: 'verbose';
    data: TraceRecord<{ phase: 'start'; tool: string; args: unknown }>;
  };
  'llm.tool_result': {
    category: 'llm';
    level: 'verbose';
    data: TraceRecord<{
      phase: 'finish';
      tool: string;
      ok: boolean;
      result?: unknown;
      error?: string;
      durationMs?: number;
    }>;
  };
  'record.coerce': {
    category: 'record';
    level: 'verbose';
    data: TraceRecord<{ record: string; field: string; shelf: string; expected: string; value?: unknown }>;
  };
  'record.schema_fail': {
    category: 'record';
    level: 'effects';
    data: TraceRecord<{ record: string; shelf: string; reason: string }>;
  };
}

export type RuntimeTraceEvent = {
  [K in RuntimeTraceEventName]: {
  ts: string;
    level: RuntimeTraceEventSpecMap[K]['level'];
    category: RuntimeTraceEventSpecMap[K]['category'];
    event: K;
    scope: RuntimeTraceScope;
    data: RuntimeTraceEventSpecMap[K]['data'];
  };
}[RuntimeTraceEventName];

export interface RuntimeTraceOptions {
  filePath?: string;
  stderr?: boolean;
}

export function isRuntimeTraceLevel(value: unknown): value is RuntimeTraceLevel {
  return typeof value === 'string' && (RUNTIME_TRACE_LEVELS as readonly string[]).includes(value);
}

export function shouldEmitRuntimeTrace(
  current: RuntimeTraceLevel,
  required: RuntimeTraceEmissionLevel
): boolean {
  if (current === 'off') {
    return false;
  }
  if (current === 'verbose') {
    return true;
  }
  return required === 'effects';
}

/**
 * Configuration for directive tracing
 */
export interface TraceConfig {
  /** Whether tracing is enabled (default: true) */
  enabled?: boolean;
  
  /** Whether to use colors in trace output (default: true) */
  useColors?: boolean;
}
