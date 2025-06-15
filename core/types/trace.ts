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

/**
 * Configuration for directive tracing
 */
export interface TraceConfig {
  /** Whether tracing is enabled (default: true) */
  enabled?: boolean;
  
  /** Whether to use colors in trace output (default: true) */
  useColors?: boolean;
}