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

export interface RuntimeTraceScope {
  exe?: string;
  operation?: string;
  box?: string;
  guard_try?: number;
  pipeline_stage?: number;
  [key: string]: unknown;
}

export interface RuntimeTraceEvent {
  ts: string;
  level: RuntimeTraceEmissionLevel;
  category: RuntimeTraceCategory;
  event: string;
  scope: RuntimeTraceScope;
  data: Record<string, unknown>;
}

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
