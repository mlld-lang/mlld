/**
 * Universal Context Architecture
 * 
 * Core principle: Context is the immutable contract between State Machine and Environment
 * - State Machine owns FLOW (stages, attempts, history)
 * - Environment owns EXECUTION (variables, code, I/O)
 * - Context is NEVER modified, only replaced
 */

export enum ExecutionMode {
  PRIMARY = 'primary',        // Normal execution
  RETRY_PREP = 'retry-prep',  // Building retry context (don't emit effects)
  RETRY = 'retry'             // Actual retry execution
}

export interface UniversalContext {
  // Execution flow (owned by State Machine)
  stage: number;        // 0 for non-pipeline, 1+ for pipeline stages
  try: number;          // Attempt number (1-based)
  isPipeline: boolean;  // Whether this is pipeline execution
  
  // Execution mode - determines whether effects should be emitted
  executionMode: ExecutionMode;
  
  // History (owned by State Machine)
  history: Array<{
    stage: number;
    try: number;
    input: string;
    output: string;
    timestamp: number;
    duration?: number;
  }>;
  
  // Future: Signals (RFC 349)
  signal?: {
    kind: 'PASS' | 'RETRY' | 'FAIL';
    why?: string;
    hint?: string;
  };
  
  // Extensible metadata
  metadata?: {
    sourceFile?: string;
    executionId?: string;
    debug?: boolean;
    totalStages?: number;
    [key: string]: any;
  };
}

/**
 * Creates a default context for non-pipeline execution
 */
export function createDefaultContext(overrides?: Partial<UniversalContext>): UniversalContext {
  return Object.freeze({
    stage: 0,
    try: 1,
    isPipeline: false,
    executionMode: ExecutionMode.PRIMARY,
    history: [],
    ...overrides
  });
}

/**
 * Creates a context for pipeline execution
 */
export function createPipelineContext(
  stage: number,
  attempt: number,
  history: UniversalContext['history'],
  metadata?: UniversalContext['metadata'],
  executionMode: ExecutionMode = ExecutionMode.PRIMARY
): UniversalContext {
  return Object.freeze({
    stage,
    try: attempt,
    isPipeline: true,
    executionMode,
    history,
    metadata
  });
}

/**
 * Helper to check if a context indicates retry is needed
 */
export function shouldRetry(context: UniversalContext): boolean {
  return context.signal?.kind === 'RETRY';
}

/**
 * Helper to get the last successful output from history
 */
export function getLastOutput(context: UniversalContext): string | undefined {
  const lastEntry = context.history[context.history.length - 1];
  return lastEntry?.output;
}

/**
 * Helper to count total attempts across all stages
 */
export function getTotalAttempts(context: UniversalContext): number {
  const attempts = new Map<number, number>();
  for (const entry of context.history) {
    const key = entry.stage;
    attempts.set(key, Math.max(attempts.get(key) || 0, entry.try));
  }
  return Array.from(attempts.values()).reduce((sum, count) => sum + count, 0);
}