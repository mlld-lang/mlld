import type { Environment } from '../../env/Environment';
import type { PipelineStage } from '@core/types';
import { PipelineExecutor, type ExecuteOptions } from './executor';
import type { StructuredValue } from '../../utils/structured-value';

// Re-export types
export type * from './types';
export { PipelineStateMachine } from './state-machine';
export { PipelineExecutor } from './executor';

/**
 * Execute a pipeline of transformation commands with @input threading
 * This is the main public API that replaces the old executePipeline function
 * 
 * @param baseOutput - The initial input string for the pipeline
 * @param pipeline - Array of pipeline commands to execute
 * @param env - The environment for variable resolution
 * @param location - Optional source location for error reporting
 * @param format - Optional format specification for pipeline input
 * @param isRetryable - Whether the initial input is retryable (came from a function)
 * @param sourceFunction - Optional function to re-execute for stage 0 retries
 * @param hasSyntheticSource - Whether the pipeline has a synthetic __source__ stage at position 0
 */
export async function executePipeline(
  baseOutput: string | StructuredValue,
  pipeline: PipelineStage[],
  env: Environment,
  location?: any,
  format?: string,
  isRetryable?: boolean,
  sourceFunction?: () => Promise<string | StructuredValue>,
  hasSyntheticSource?: boolean,
  parallelCap?: number,
  delayMs?: number
): Promise<string>;
export async function executePipeline(
  baseOutput: string | StructuredValue,
  pipeline: PipelineStage[],
  env: Environment,
  location: any,
  format: string | undefined,
  isRetryable: boolean,
  sourceFunction: (() => Promise<string | StructuredValue>) | undefined,
  hasSyntheticSource: boolean,
  parallelCap: number | undefined,
  delayMs: number | undefined,
  options: ExecuteOptions & { returnStructured: true }
): Promise<StructuredValue>;
export async function executePipeline(
  baseOutput: string | StructuredValue,
  pipeline: PipelineStage[],
  env: Environment,
  location?: any,
  format?: string,
  isRetryable: boolean = false,
  sourceFunction?: () => Promise<string | StructuredValue>,
  hasSyntheticSource: boolean = false,
  parallelCap?: number,
  delayMs?: number,
  options?: ExecuteOptions
): Promise<string | StructuredValue> {
  const executor = new PipelineExecutor(pipeline, env, format, isRetryable, sourceFunction, hasSyntheticSource, parallelCap, delayMs);
  if (options?.returnStructured) {
    return await executor.execute(baseOutput, { returnStructured: true });
  }
  return await executor.execute(baseOutput);
}
