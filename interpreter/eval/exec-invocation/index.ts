import type { ExecInvocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { getEvaluator } from './evaluator';

/**
 * Evaluate an ExecInvocation node
 * Executes a previously defined exec command with arguments
 * 
 * @param node - The ExecInvocation AST node to evaluate
 * @param env - The environment containing variables and exec definitions
 * @param evaluator - Optional universal context evaluator for advanced features
 * @returns Promise resolving to the execution result with value and environment
 */
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment,
  evaluator?: IEvaluator
): Promise<EvalResult> {
  // ALWAYS use refactored implementation for testing
  const refactoredEvaluator = getEvaluator();
  return await refactoredEvaluator.evaluate(node, env, evaluator);
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