import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';
import { PipelineExecutor } from './executor';

// Re-export types
export type * from './types';
export { PipelineStateMachine, EventQuery } from './state-machine';
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
 */
export async function executePipeline(
  baseOutput: string,
  pipeline: PipelineCommand[],
  env: Environment,
  location?: any,
  format?: string,
  isRetryable: boolean = false,
  sourceFunction?: () => Promise<string>
): Promise<string> {
  const executor = new PipelineExecutor(pipeline, env, format, isRetryable, sourceFunction);
  return await executor.execute(baseOutput);
}