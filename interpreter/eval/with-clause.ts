import type { WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { MlldInterpreterError } from '@core/errors';
import { asText } from '../utils/structured-value';
import { wrapExecResult, wrapPipelineResult, isStructuredExecEnabled } from '../utils/structured-exec';

function legacyStdout(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function legacyText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) || typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Apply withClause transformations to a result
 * This handles pipeline commands, trust validation, and dependency checks
 */
export async function applyWithClause(
  input: unknown,
  withClause: WithClause,
  env: Environment
): Promise<EvalResult> {
  const structuredEnabled = isStructuredExecEnabled();

  if (!structuredEnabled) {
    // TODO(Phase7): remove legacy with-clause flow once structured exec is default.
    let legacyResult: any = input;

    if (withClause.pipeline && withClause.pipeline.length > 0) {
      const { processPipeline } = await import('./pipeline/unified-processor');
      legacyResult = await processPipeline({
        value: legacyResult,
        env,
        pipeline: withClause.pipeline,
        format: withClause.format as string | undefined,
        isRetryable: false
      });
    }

    if (withClause.needs) {
      await checkDependencies(withClause.needs, env);
    }

    return {
      value: legacyResult,
      env,
      stdout: legacyStdout(legacyResult),
      stderr: '',
      exitCode: 0
    };
  }

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
      isRetryable: false // with-clause doesn't track source function
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
