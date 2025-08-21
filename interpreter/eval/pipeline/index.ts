import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';
import { PipelineExecutor } from './executor';
import { USE_UNIVERSAL_CONTEXT } from '@core/feature-flags';
import { createEvaluatorAdapter } from '../../index';

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
  baseOutput: string,
  pipeline: PipelineCommand[],
  env: Environment,
  location?: any,
  format?: string,
  isRetryable: boolean = false,
  sourceFunction?: () => Promise<string>,
  hasSyntheticSource: boolean = false
): Promise<string> {
  // Wire evaluator through when in universal context mode
  const evaluator = USE_UNIVERSAL_CONTEXT ? createEvaluatorAdapter() : undefined;
  
  const executor = new PipelineExecutor(
    pipeline, 
    env, 
    format, 
    isRetryable, 
    sourceFunction,
    evaluator  // Pass the evaluator as 6th parameter (no hasSyntheticSource)
  );
  return await executor.execute(baseOutput);
}