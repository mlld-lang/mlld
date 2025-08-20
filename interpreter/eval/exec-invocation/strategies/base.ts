import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

/**
 * Base strategy for execution types
 * Each strategy handles one execution pattern (template/code/command/etc)
 * Strategies are composable and independently testable
 */
export interface ExecutionStrategy {
  /**
   * Determines if this strategy handles the given executable type
   * Return true to claim execution, false to pass to next strategy
   */
  canHandle(executable: ExecutableDefinition): boolean;
  
  /**
   * Execute the executable definition
   * @param executable The executable to execute
   * @param env The environment with bound parameters
   * @param evaluator Optional universal context evaluator
   * @returns The execution result
   */
  execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult>;
}

/**
 * Base class for execution strategies with common functionality
 */
export abstract class BaseExecutionStrategy implements ExecutionStrategy {
  abstract canHandle(executable: ExecutableDefinition): boolean;
  abstract execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult>;
  
  /**
   * Helper method to create a simple result
   */
  protected createResult(value: any, env: Environment): EvalResult {
    return { value, env };
  }
}