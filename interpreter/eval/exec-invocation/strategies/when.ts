import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { logger } from '@core/utils/logger';

/**
 * Strategy for executing mlld-when executables
 * Handles conditional execution with WhenExpression
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