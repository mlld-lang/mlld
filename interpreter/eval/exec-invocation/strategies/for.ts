import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { logger } from '@core/utils/logger';

/**
 * Strategy for executing mlld-for executables
 * Handles iteration with ForExpression
 */
export class ForExecutionStrategy extends BaseExecutionStrategy {
  canHandle(executable: ExecutableDefinition): boolean {
    // Check if it's a for-type executable
    return executable.type === 'mlld-for' || 
           (executable.type === 'code' && executable.language === 'mlld-for') ||
           !!executable.forExpression;
  }
  
  async execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!executable.forExpression) {
      throw new Error('For executable missing forExpression');
    }
    
    if (process.env.DEBUG_FOR || process.env.DEBUG_EXEC) {
      logger.debug('Executing for expression', {
        itemName: executable.forExpression.itemName,
        hasAction: !!executable.forExpression.action
      });
    }
    
    // Import and evaluate the for expression
    const { evaluateForExpression } = await import('@interpreter/eval/foreach');
    
    // Create a child environment for for evaluation
    const forEnv = env.createChild();
    
    // Evaluate the for expression
    const result = await evaluateForExpression(
      executable.forExpression,
      forEnv
    );
    
    // Merge the child environment back
    env.mergeChild(forEnv);
    
    return result;
  }
}