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
 */
export async function executePipeline(
  baseOutput: string,
  pipeline: PipelineCommand[],
  env: Environment,
  location?: any,
  format?: string
): Promise<string> {
  const executor = new PipelineExecutor(pipeline, env, format);
  return await executor.execute(baseOutput);
}