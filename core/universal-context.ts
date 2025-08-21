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
  // Core fields (owned by State Machine)
  try: number;          // Current attempt (1-based): 1 = first try, 2 = first retry, etc.
  tries: Array<{       // History of attempts for current stage
    attempt: number;
    result: "success" | "retry" | "error";
    hint?: string | object;  // Hint from retry directive
    output?: any;            // What that attempt produced
  }>;
  stage: number;        // Current pipeline stage (0-based internally, 1-based for display)
  isPipeline: boolean;  // true if executing in a pipeline, false otherwise
  
  // Retry communication
  hint: string | object | null;  // Hint from last retry (if any)
  lastOutput: any;               // Output from last attempt (if retrying)
  
  // Input/output
  input: any;           // Input to current stage/function
  
  // Execution mode - determines whether effects should be emitted
  executionMode: ExecutionMode;
  
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
    try: 1,
    tries: [],
    stage: 0,
    isPipeline: false,
    hint: null,
    lastOutput: null,
    input: null,
    executionMode: ExecutionMode.PRIMARY,
    ...overrides
  });
}

/**
 * Creates a context for pipeline execution
 */
export function createPipelineContext(
  stage: number,
  attempt: number,
  tries: UniversalContext['tries'],
  hint: string | object | null = null,
  lastOutput: any = null,
  input: any = null,
  metadata?: UniversalContext['metadata'],
  executionMode: ExecutionMode = ExecutionMode.PRIMARY
): UniversalContext {
  return Object.freeze({
    try: attempt,
    tries,
    stage,
    isPipeline: true,
    hint,
    lastOutput,
    input,
    executionMode,
    metadata
  });
}

/**
 * Helper to get the last retry hint from tries array
 */
export function getLastHint(context: UniversalContext): string | object | null {
  if (context.tries.length === 0) return null;
  const lastTry = context.tries[context.tries.length - 1];
  return lastTry.hint || null;
}

/**
 * Helper to get the last output from tries array
 */
export function getLastOutput(context: UniversalContext): any {
  if (context.tries.length === 0) return null;
  const lastTry = context.tries[context.tries.length - 1];
  return lastTry.output;
}

/**
 * Helper to count total attempts for current stage
 */
export function getTotalAttempts(context: UniversalContext): number {
  return context.try;
}