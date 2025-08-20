import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { logger } from '@core/utils/logger';

/**
 * Executes when-expression-based conditionals
 * 
 * Handles mlld's conditional execution patterns including:
 * - Simple conditions: @when @x > 5 => @action
 * - First-match: @when first [@cond1 => @act1, @cond2 => @act2]
 * - All-match: @when all [@cond1 => @act1, @cond2 => @act2]
 * - Any-match: @when any [@cond1 => @act1, @cond2 => @act2]
 * 
 * EVALUATION: Conditions are evaluated lazily, actions execute only when matched
 * CONTEXT: When expressions have access to all parent scope variables
 */
export class WhenExecutionStrategy extends BaseExecutionStrategy {
  canHandle(executable: ExecutableDefinition): boolean {
    // Check if it's a when-type executable
    return executable.type === 'mlld-when' || 
           (executable.type === 'code' && executable.language === 'mlld-when') ||
           !!executable.whenExpression;
  }
  
  async execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!executable.whenExpression) {
      throw new Error('When executable missing whenExpression');
    }
    
    if (process.env.DEBUG_WHEN || process.env.DEBUG_EXEC) {
      logger.debug('Executing when expression', {
        hasConditions: !!executable.whenExpression.conditions,
        conditionCount: executable.whenExpression.conditions?.length
      });
    }
    
    // Import and evaluate the when expression
    const { evaluateWhenExpression } = await import('@interpreter/eval/when');
    
    // Create a child environment for when evaluation
    const whenEnv = env.createChild();
    
    // Evaluate the when expression
    const result = await evaluateWhenExpression(
      executable.whenExpression,
      whenEnv
    );
    
    // Merge the child environment back
    env.mergeChild(whenEnv);
    
    return result;
  }
}