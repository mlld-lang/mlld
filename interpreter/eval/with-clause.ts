import type { WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { MlldInterpreterError } from '@core/errors';
import { asText } from '../utils/structured-value';
import { wrapExecResult, wrapPipelineResult } from '../utils/structured-exec';

/**
 * Apply withClause transformations to a result
 * This handles pipeline commands, trust validation, and dependency checks
 */
export async function applyWithClause(
  input: unknown,
  withClause: WithClause,
  env: Environment
): Promise<EvalResult> {
  let result: any = wrapExecResult(input);
  
  // Apply pipeline transformations
  if (withClause.pipeline && withClause.pipeline.length > 0) {
    // Use unified pipeline processor
    const { processPipeline } = await import('./pipeline/unified-processor');
    const pipelineResult = await processPipeline({
      value: result,
      env,
      pipeline: withClause.pipeline,
      format: withClause.format as string | undefined,
      isRetryable: false, // with-clause doesn't track source function
      stream: withClause.stream === true
    });
    result = wrapPipelineResult(pipelineResult);
  }
  
  // Check dependencies if specified
  if (withClause.needs) {
    await checkDependencies(withClause.needs, env);
  }
  
  return {
    value: result,
    env,
    stdout: asText(result),
    stderr: '',
    exitCode: 0
  };
}

/**
 * Check dependencies
 */
async function checkDependencies(
  needs: Record<string, any>,
  env: Environment
): Promise<void> {
  // TODO: Implement dependency checking
  // For now, just validate that files exist if specified
  if (needs.file) {
    const exists = await env.fileSystem.exists(needs.file);
    if (!exists) {
      throw new MlldInterpreterError(`Required file not found: ${needs.file}`);
    }
  }
}
