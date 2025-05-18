/**
 * Execution extension patterns
 */
import { MeldNode } from '@core/types/nodes';
import { Result } from '@core/types/common';
import { ProcessingContext } from '@core/types/services/context';
import { StateChanges } from '@core/types/services/state';

/**
 * Execution result for a node
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  
  /** State changes from execution */
  changes?: StateChanges;
  
  /** Output from execution */
  output?: unknown;
  
  /** Execution errors */
  errors?: ExecutionError[];
  
  /** Execution metadata */
  metadata?: ExecutionMetadata;
}

/**
 * Execution error information
 */
export interface ExecutionError {
  /** Error code */
  code: string;
  
  /** Error message */
  message: string;
  
  /** Stack trace if available */
  stack?: string;
  
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Metadata about the execution
 */
export interface ExecutionMetadata {
  /** When execution started */
  startTime: Date;
  
  /** When execution ended */
  endTime: Date;
  
  /** Execution duration in milliseconds */
  duration: number;
  
  /** Resources used */
  resources?: ResourceUsage;
}

/**
 * Resource usage information
 */
export interface ResourceUsage {
  /** Memory used in bytes */
  memory?: number;
  
  /** CPU time used in milliseconds */
  cpu?: number;
  
  /** I/O operations performed */
  io?: number;
}

/**
 * Extension interface for execution
 */
export interface IExecutionExtension {
  /** Execute a node */
  execute(node: MeldNode, context: ProcessingContext): Promise<Result<ExecutionResult>>;
  
  /** Register custom executors */
  registerExecutor(nodeType: string, executor: NodeExecutor): void;
  
  /** Get registered executors */
  getExecutors(): Map<string, NodeExecutor[]>;
  
  /** Hook for pre-execution */
  beforeExecute?(node: MeldNode, context: ProcessingContext): Promise<void>;
  
  /** Hook for post-execution */
  afterExecute?(node: MeldNode, result: ExecutionResult, context: ProcessingContext): Promise<void>;
}

/**
 * Node executor function
 */
export type NodeExecutor = (node: MeldNode, context: ProcessingContext) => Promise<ExecutionResult>;