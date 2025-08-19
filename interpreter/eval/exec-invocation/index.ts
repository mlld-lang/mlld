import type { ExecInvocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { getEvaluator } from './evaluator';

// Re-export the legacy implementation
export { evaluateExecInvocation as evaluateExecInvocationLegacy } from '../exec-invocation';

/**
 * Evaluate an ExecInvocation node
 * Uses refactored implementation if USE_REFACTORED_EXEC is set
 * Falls back to legacy implementation otherwise
 */
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment,
  evaluator?: IEvaluator
): Promise<EvalResult> {
  // Check for feature flag
  if (process.env.USE_REFACTORED_EXEC === 'true') {
    // Use refactored implementation
    const refactoredEvaluator = getEvaluator();
    return await refactoredEvaluator.evaluate(node, env, evaluator);
  }
  
  // Fall back to legacy implementation
  const { evaluateExecInvocation: legacyEval } = await import('../exec-invocation');
  return await legacyEval(node, env);
}

// Export helpers for testing
export { CommandResolver } from './helpers/command-resolver';
export { VariableFactory } from './helpers/variable-factory';
export { ShadowEnvironmentManager } from './helpers/shadow-manager';
export { MetadataShelf, globalMetadataShelf } from './helpers/metadata-shelf';

// Export strategies for testing
export * from './strategies';

// Export evaluator for direct access if needed
export { ExecInvocationEvaluator, getEvaluator } from './evaluator';