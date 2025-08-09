import type { WithClause, PipelineCommand, TrustLevel } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { MlldInterpreterError } from '@core/errors';

/**
 * Apply withClause transformations to a result
 * This handles pipeline commands, trust validation, and dependency checks
 */
export async function applyWithClause(
  input: string,
  withClause: WithClause,
  env: Environment
): Promise<EvalResult> {
  let result = input;
  
  // Apply pipeline transformations
  if (withClause.pipeline && withClause.pipeline.length > 0) {
    // Extract format from with clause if specified
    const format = withClause.format as string | undefined;
    
    // Import the pipeline execution function
    const { executePipeline } = await import('./pipeline');
    
    // Execute the entire pipeline with format
    result = await executePipeline(
      result,
      withClause.pipeline,
      env,
      undefined, // location
      format,
      false // isRetryable - with-clause doesn't track source function
    );
  }
  
  // Apply trust validation
  if (withClause.trust) {
    validateTrust(result, withClause.trust);
  }
  
  // Check dependencies if specified
  if (withClause.needs) {
    await checkDependencies(withClause.needs, env);
  }
  
  return {
    value: result,
    env,
    stdout: result,
    stderr: '',
    exitCode: 0
  };
}

/**
 * Validate trust level
 */
function validateTrust(result: string, trustLevel: TrustLevel): void {
  // TODO: Implement trust validation
  // For now, just log a warning
  if (trustLevel === 'never') {
    throw new MlldInterpreterError('Trust level "never" not yet implemented');
  }
  
  // 'always' means no validation needed
  // 'verify' would prompt user for confirmation (not implemented)
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