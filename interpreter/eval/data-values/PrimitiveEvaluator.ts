import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';
import { isDirectiveValue, isPrimitiveValue } from '@core/types/var';
import { evaluate } from '../../core/interpreter';
import { EvaluationStateManager } from './EvaluationStateManager';

/**
 * Handles evaluation of primitive data values and simple AST nodes.
 * 
 * This evaluator processes:
 * - Primitive values (strings, numbers, booleans, null)
 * - Text AST nodes
 * - Embedded directive values with caching
 */
export class PrimitiveEvaluator {
  constructor(private stateManager: EvaluationStateManager) {}

  /**
   * Checks if this evaluator can handle the given data value
   */
  canHandle(value: DataValue): boolean {
    // Handle primitive values
    if (isPrimitiveValue(value)) {
      return true;
    }
    
    // Handle Text nodes
    if (value && typeof value === 'object' && value.type === 'Text' && 'content' in value) {
      return true;
    }
    
    // Handle embedded directives
    if (isDirectiveValue(value)) {
      return true;
    }
    
    return false;
  }

  /**
   * Evaluates primitive data values and simple AST nodes
   */
  async evaluate(value: DataValue, env: Environment): Promise<any> {
    // Primitive values pass through unchanged
    if (isPrimitiveValue(value)) {
      return value;
    }
    
    // Handle Text nodes
    if (value && typeof value === 'object' && value.type === 'Text' && 'content' in value) {
      return value.content;
    }
    
    // Handle embedded directives
    if (isDirectiveValue(value)) {
      return await this.evaluateDirective(value, env);
    }
    
    throw new Error(`PrimitiveEvaluator cannot handle value type: ${typeof value}`);
  }

  /**
   * Evaluates an embedded directive with caching
   */
  private async evaluateDirective(value: any, env: Environment): Promise<any> {
    // Check if we've already evaluated this directive
    const cached = this.stateManager.getCachedResult(value);
    if (cached?.hit && !cached.error) {
      return cached.result;
    }
    
    // If we have a cached error, throw it
    if (cached?.hit && cached.error) {
      throw cached.error;
    }
    
    try {
      // Create a child environment to capture output without affecting the parent
      const childEnv = env.createChild();
      
      // Evaluate the directive in the child environment
      const result = await evaluate([value], childEnv);
      
      // For run and add directives in data context, trim trailing newlines
      let finalValue = result.value;
      if ((value.kind === 'run' || value.kind === 'add') && typeof finalValue === 'string') {
        finalValue = finalValue.replace(/\n+$/, '');
      }
      
      // Cache the result
      this.stateManager.setCachedResult(value, finalValue);
      
      return finalValue;
    } catch (error) {
      // Cache the error
      this.stateManager.setCachedResult(value, undefined, error as Error);
      throw error;
    }
  }
}