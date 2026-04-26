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

export const RUNTIME_TRACE_LEVELS = ['off', 'effects', 'handle', 'handles', 'verbose'] as const;

export type RuntimeTraceLevel = (typeof RUNTIME_TRACE_LEVELS)[number];
export type RuntimeTraceNormalizedLevel = Exclude<RuntimeTraceLevel, 'handles'>;
export type RuntimeTraceEmissionLevel = 'effects' | 'verbose';

export type RuntimeTraceCategory =
  | 'session'
  | 'shelf'
  | 'guard'
  | 'handle'
  | 'policy'
  | 'auth'
  | 'display'
  | 'llm'
  | 'mcp'
  | 'memory'
  | 'record'
  | 'import'
  | 'proof';

type TraceRecord<T extends object> = T & Record<string, unknown>;

export type RuntimeTraceEventName =
  | 'session.seed'
  | 'session.write'
  | 'session.final'
  | 'import.resolve'
  | 'import.cache_hit'
  | 'import.read'
  | 'import.parse'
  | 'import.evaluate'
  | 'import.exports'
  | 'import.fail'
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
  | 'handle.issued'
  | 'handle.resolved'
  | 'handle.resolve_failed'
  | 'handle.released'
  | 'policy.build'
  | 'policy.validate'
  | 'policy.compile_drop'
  | 'policy.compile_repair'
  | 'policy.error'
  | 'auth.check'
  | 'auth.allow'
  | 'auth.deny'
  | 'display.project'
  | 'llm.call'
  | 'llm.resume'
  | 'llm.tool_call'
  | 'llm.tool_result'
  | 'mcp.request'
  | 'mcp.progress'
  | 'mcp.response'
  | 'memory.sample'
  | 'memory.delta'
  | 'memory.gc'
  | 'memory.pressure'
  | 'record.coerce'
  | 'record.schema_fail'
  | 'proof.lifted';

export interface RuntimeTraceScope {
  exe?: string;
  operation?: string;
  box?: string;
  guard_try?: number;
  pipeline_stage?: number;
  file?: string;
  frameId?: string;
  parentFrameId?: string;
  [key: string]: unknown;
}

type RuntimeImportTraceRecord = TraceRecord<{
  ref: string;
  resolvedPath?: string;
  transport?: string;
  importType?: string;
  directive?: string;
  contentType?: string;
  resolverName?: string;
  cacheKey?: string;
  entryCount?: number;
  exportCount?: number;
  phase?: string;
  error?: string;
}>;

type RuntimeMemoryTraceRecord = TraceRecord<{
  label: string;
  phase?: string;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  deltaRss?: number;
  deltaHeapUsed?: number;
  deltaHeapTotal?: number;
  deltaExternal?: number;
  deltaArrayBuffers?: number;
  previousLabel?: string;
  gcAvailable?: boolean;
  detail?: string;
  pressure?: string;
}>;

export interface RuntimeTraceEventSpecMap {
  'session.seed': {
    category: 'session';
    level: 'effects';
    data: TraceRecord<{
      frameId: string;
      sessionName: string;
      declarationId: string;
      originPath?: string;
      path: string;
      operation: string;
      value?: unknown;
    }>;
  };
  'session.write': {
    category: 'session';
    level: 'effects';
    data: TraceRecord<{
      frameId: string;
      sessionName: string;
      declarationId: string;
      originPath?: string;
      path: string;
      operation: string;
      previous?: unknown;
      value?: unknown;
    }>;
  };
  'session.final': {
    category: 'session';
    level: 'effects';
    data: TraceRecord<{
      frameId: string;
      sessionName: string;
      declarationId: string;
      originPath?: string;
      finalState: Record<string, unknown>;
    }>;
  };
  'import.resolve': {
    category: 'import';
    level: 'verbose';
    data: RuntimeImportTraceRecord;
  };
  'import.cache_hit': {
    category: 'import';
    level: 'verbose';
    data: RuntimeImportTraceRecord;
  };
  'import.read': {
    category: 'import';
    level: 'verbose';
    data: RuntimeImportTraceRecord;
  };
  'import.parse': {
    category: 'import';
    level: 'verbose';
    data: RuntimeImportTraceRecord;
  };
  'import.evaluate': {
    category: 'import';
    level: 'verbose';
    data: RuntimeImportTraceRecord;
  };
  'import.exports': {
    category: 'import';
    level: 'verbose';
    data: RuntimeImportTraceRecord;
  };
  'import.fail': {
    category: 'import';
    level: 'effects';
    data: RuntimeImportTraceRecord & TraceRecord<{ phase: string; error: string }>;
  };
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
  'handle.issued': {
    category: 'handle';
    level: 'verbose';
    data: TraceRecord<{ handle: string; valuePreview?: unknown; factsourceRef?: string; sessionId?: string }>;
  };
  'handle.resolved': {
    category: 'handle';
    level: 'verbose';
    data: TraceRecord<{ handle: string; valuePreview?: unknown; sessionId?: string }>;
  };
  'handle.resolve_failed': {
    category: 'handle';
    level: 'verbose';
    data: TraceRecord<{ handle: string; reason?: string; sessionId?: string }>;
  };
  'handle.released': {
    category: 'handle';
    level: 'verbose';
    data: TraceRecord<{ sessionId: string; handleCount: number }>;
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
      intentMode?: 'bucketed' | 'flat' | 'empty';
      callerRole?: string | null;
      issueCodes?: string[];
      tools?: Array<{
        tool: string;
        rawArgKeys: string[];
        controlArgKeys: string[];
        payloadArgKeys: string[];
        updateArgKeys: string[];
      }>;
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
  'proof.lifted': {
    category: 'proof';
    level: 'verbose';
    data: TraceRecord<{ mode: string; liftedArgs: Array<{ tool: string; arg: string; liftedLabels: string[]; element?: number }> }>;
  };
  'policy.error': {
    category: 'policy';
    level: 'effects';
    data: TraceRecord<{
      tool?: string;
      code?: string;
      message: string;
      phase?: string;
      direction?: string;
      field?: string;
      error: unknown;
    }>;
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
  'mcp.request': {
    category: 'mcp';
    level: 'verbose';
    data: TraceRecord<{
      phase: 'start';
      bridge: string;
      sessionId?: string;
      requestId: number;
      jsonrpcId?: string | number | null;
      method: string;
      tool?: string;
      args?: unknown;
      argBytes?: number;
    }>;
  };
  'mcp.response': {
    category: 'mcp';
    level: 'verbose';
    data: TraceRecord<{
      phase: 'finish';
      bridge: string;
      sessionId?: string;
      requestId: number;
      jsonrpcId?: string | number | null;
      method: string;
      tool?: string;
      ok: boolean;
      isError?: boolean;
      error?: string;
      errorCode?: number;
      durationMs: number;
      responseBytes?: number;
      clientClosed: boolean;
    }>;
  };
  'mcp.progress': {
    category: 'mcp';
    level: 'verbose';
    data: TraceRecord<{
      phase: 'progress';
      bridge: string;
      sessionId?: string;
      requestId: number;
      jsonrpcId?: string | number | null;
      method: string;
      tool?: string;
      durationMs: number;
      clientClosed: boolean;
    }>;
  };
  'memory.sample': {
    category: 'memory';
    level: 'effects';
    data: RuntimeMemoryTraceRecord;
  };
  'memory.delta': {
    category: 'memory';
    level: 'effects';
    data: RuntimeMemoryTraceRecord;
  };
  'memory.gc': {
    category: 'memory';
    level: 'verbose';
    data: RuntimeMemoryTraceRecord;
  };
  'memory.pressure': {
    category: 'memory';
    level: 'effects';
    data: RuntimeMemoryTraceRecord;
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
  memory?: boolean;
  retainLimit?: number;
}

export function isRuntimeTraceLevel(value: unknown): value is RuntimeTraceLevel {
  return typeof value === 'string' && (RUNTIME_TRACE_LEVELS as readonly string[]).includes(value);
}

export function normalizeRuntimeTraceLevel(level: RuntimeTraceLevel): RuntimeTraceNormalizedLevel {
  return level === 'handles' ? 'handle' : level;
}

export function shouldEmitRuntimeTrace(
  current: RuntimeTraceLevel,
  required: RuntimeTraceEmissionLevel,
  category: RuntimeTraceCategory
): boolean {
  const normalized = normalizeRuntimeTraceLevel(current);
  if (normalized === 'off') {
    return false;
  }
  if (normalized === 'verbose') {
    return true;
  }
  if (category === 'memory') {
    return required === 'effects';
  }
  if (normalized === 'handle') {
    return category === 'handle';
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
