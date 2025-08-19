import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { logger } from '@core/utils/logger';

/**
 * Strategy for executing built-in transformer functions
 * Handles @json, @upper, @lower, etc.
 * 
 * Note: @typeof is handled as a special case in the main evaluator
 * since it needs access to Variable metadata
 */
export class TransformerExecutionStrategy extends BaseExecutionStrategy {
  canHandle(executable: ExecutableDefinition): boolean {
    // Check if it has transformer metadata
    // This is set by the Variable when it's a built-in transformer
    return !!(executable as any).isBuiltinTransformer;
  }
  
  async execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    const execWithMeta = executable as any;
    
    if (!execWithMeta.transformerImplementation) {
      throw new Error('Transformer executable missing implementation');
    }
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing transformer', {
        name: execWithMeta.name
      });
    }
    
    // Get the transformer implementation
    const impl = execWithMeta.transformerImplementation;
    
    // Get arguments from environment
    // Transformers typically use positional parameters
    const args: any[] = [];
    
    // Check for common parameter names used by transformers
    const paramNames = ['value', 'input', 'data', 'arg', 'param'];
    for (const name of paramNames) {
      const variable = env.getVariable(name);
      if (variable) {
        const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
        const value = await extractVariableValue(variable, env);
        args.push(value);
      }
    }
    
    // Execute the transformer
    const result = await impl(...args);
    
    return {
      value: result,
      env
    };
  }
}