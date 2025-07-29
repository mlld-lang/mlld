/**
 * When Expression Evaluator
 * 
 * Handles value-returning when expressions used in /var and /exe contexts.
 * Distinct from directive /when which executes side effects.
 */

import type { WhenExpressionNode, WhenConditionPair } from '@core/types/when';
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { MlldWhenExpressionError } from '@core/errors';
import { evaluate } from '../core/interpreter';
import { evaluateCondition } from './when';
import { logger } from '@core/utils/logger';

/**
 * Evaluates a when expression node to return a value.
 * 
 * Key differences from directive /when:
 * 1. Returns the value of the matching action (not empty string)
 * 2. Returns null if no conditions match
 * 3. Supports tail modifiers on the result
 * 4. Uses first-match semantics
 */
export async function evaluateWhenExpression(
  node: WhenExpressionNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const errors: Error[] = [];
  
  // Empty conditions array - return null
  if (node.conditions.length === 0) {
    return { value: null, env };
  }
  
  // Check if any condition has an action
  const hasAnyAction = node.conditions.some(c => c.action && c.action.length > 0);
  if (!hasAnyAction) {
    logger.warn('WhenExpression has no actions defined');
    return { value: null, env };
  }
  
  // Evaluate conditions in order (first-match semantics)
  for (let i = 0; i < node.conditions.length; i++) {
    const pair = node.conditions[i];
    
    try {
      // Evaluate the condition
      const conditionResult = await evaluateCondition(pair.condition, env);
      
      if (process.env.DEBUG_WHEN) {
        logger.debug('WhenExpression condition result:', { 
          index: i, 
          conditionResult,
          hasAction: !!(pair.action && pair.action.length > 0)
        });
      }
      
      if (conditionResult) {
        // Condition matched - evaluate the action
        if (!pair.action || pair.action.length === 0) {
          // No action for this condition - return null
          return { value: null, env };
        }
        
        try {
          // Evaluate the action to get its value
          const actionResult = await evaluate(pair.action, env, {
            ...context,
            isExpression: true // Mark as expression context
          });
          
          let value = actionResult.value;
          
          // Apply tail modifiers if present
          if (node.withClause && node.withClause.pipes) {
            value = await applyTailModifiers(value, node.withClause.pipes, env);
          }
          
          return { value, env };
        } catch (actionError) {
          throw new MlldWhenExpressionError(
            `Error evaluating action for condition ${i + 1}: ${actionError.message}`,
            node.location,
            { conditionIndex: i, phase: 'action', originalError: actionError }
          );
        }
      }
    } catch (conditionError) {
      // Collect condition errors but continue evaluating
      errors.push(new MlldWhenExpressionError(
        `Error evaluating condition ${i + 1}: ${conditionError.message}`,
        node.location,
        { conditionIndex: i, phase: 'condition', originalError: conditionError }
      ));
    }
  }
  
  // If we collected errors and no condition matched, report them
  if (errors.length > 0) {
    throw new MlldWhenExpressionError(
      `When expression evaluation failed with ${errors.length} condition errors`,
      node.location,
      { errors }
    );
  }
  
  // No conditions matched - return null
  return { value: null, env };
}

/**
 * Apply tail modifiers (pipeline operations) to a value
 */
async function applyTailModifiers(
  value: unknown,
  pipes: BaseMlldNode[],
  env: Environment
): Promise<unknown> {
  let result = value;
  
  for (const pipe of pipes) {
    // Create a child environment with the current value as pipeline input
    const pipeEnv = env.createChild();
    
    // Set up pipeline input variable
    const { createPipelineInputVariable } = await import('@core/types/variable');
    const pipelineInput = {
      text: String(result),
      data: result,
      toString: () => String(result)
    };
    
    const pipelineVar = createPipelineInputVariable(
      '_pipelineInput',
      pipelineInput,
      'text',
      String(result),
      { directive: 'var', syntax: 'reference', hasInterpolation: false, isMultiLine: false },
      0
    );
    
    pipeEnv.setVariable('_pipelineInput', pipelineVar);
    
    // Evaluate the pipe operation
    const pipeResult = await evaluate(pipe, pipeEnv);
    result = pipeResult.value;
  }
  
  return result;
}

/**
 * Create a WhenExpressionVariable that evaluates lazily
 */
export async function createLazyWhenExpressionVariable(
  name: string,
  definition: WhenExpressionNode,
  env: Environment,
  parameterNames?: string[]
): Promise<import('@core/types/variable').WhenExpressionVariable> {
  const { createWhenExpressionVariable } = await import('@core/types/variable');
  
  const source: import('@core/types/variable').VariableSource = {
    directive: 'var',
    syntax: 'template', // when expressions are template-like
    hasInterpolation: true, // conditions can reference variables
    isMultiLine: true // typically multiline
  };
  
  const metadata: import('@core/types/variable').VariableMetadata & 
    import('@core/types/variable').WhenExpressionVariable['metadata'] = {
    isEvaluated: false,
    conditionCount: definition.conditions.length,
    hasParameters: !!parameterNames && parameterNames.length > 0,
    parameterNames: parameterNames || []
  };
  
  return createWhenExpressionVariable(name, definition, source, metadata);
}

/**
 * Evaluate a WhenExpressionVariable when accessed
 */
export async function evaluateWhenExpressionVariable(
  variable: import('@core/types/variable').WhenExpressionVariable,
  env: Environment,
  args?: unknown[]
): Promise<unknown> {
  // If already evaluated and no parameters, return cached value
  if (variable.metadata.isEvaluated && !variable.metadata.hasParameters) {
    return variable.value;
  }
  
  // Create evaluation environment
  let evalEnv = env;
  
  // If this is a parameterized when expression (from /exe), bind parameters
  if (variable.metadata.hasParameters && args) {
    evalEnv = env.createChild();
    const paramNames = variable.metadata.parameterNames || [];
    
    // Import variable creation functions
    const { createSimpleTextVariable, createPrimitiveVariable } = await import('@core/types/variable');
    
    // Bind parameters
    for (let i = 0; i < paramNames.length; i++) {
      const paramName = paramNames[i];
      const paramValue = args[i] ?? null;
      
      // Create appropriate variable type based on value
      let paramVar;
      if (typeof paramValue === 'string') {
        paramVar = createSimpleTextVariable(
          paramName,
          paramValue,
          { directive: 'var', syntax: 'quoted', hasInterpolation: false, isMultiLine: false }
        );
      } else if (typeof paramValue === 'number' || typeof paramValue === 'boolean' || paramValue === null) {
        paramVar = createPrimitiveVariable(
          paramName,
          paramValue,
          { directive: 'var', syntax: 'quoted', hasInterpolation: false, isMultiLine: false }
        );
      } else {
        // For complex types, create appropriate variable
        // This would need more sophisticated handling in production
        paramVar = createSimpleTextVariable(
          paramName,
          JSON.stringify(paramValue),
          { directive: 'var', syntax: 'quoted', hasInterpolation: false, isMultiLine: false }
        );
      }
      
      evalEnv.setVariable(paramName, paramVar);
    }
  }
  
  // Evaluate the when expression
  const result = await evaluateWhenExpression(variable.definition, evalEnv);
  
  // Cache result if not parameterized
  if (!variable.metadata.hasParameters) {
    variable.value = result.value;
    variable.metadata.isEvaluated = true;
    variable.metadata.evaluatedAt = new Date();
  }
  
  return result.value;
}

/**
 * Peek at the type of a when expression without full evaluation
 * Used for type inference in var assignments
 */
export async function peekWhenExpressionType(
  node: WhenExpressionNode,
  env: Environment
): Promise<import('@core/types/variable').VariableTypeDiscriminator> {
  // Analyze action types without evaluation
  const actionTypes = new Set<import('@core/types/variable').VariableTypeDiscriminator>();
  
  for (const pair of node.conditions) {
    if (pair.action && pair.action.length > 0) {
      // Simple heuristic based on first node type
      const firstNode = pair.action[0];
      
      if (firstNode.type === 'Text') {
        actionTypes.add('simple-text');
      } else if (firstNode.type === 'Literal') {
        const literal = firstNode as any;
        if (typeof literal.value === 'number') {
          actionTypes.add('primitive');
        } else if (typeof literal.value === 'boolean') {
          actionTypes.add('primitive');
        } else if (literal.value === null) {
          actionTypes.add('primitive');
        }
      } else if (firstNode.type === 'object') {
        actionTypes.add('object');
      } else if (firstNode.type === 'array') {
        actionTypes.add('array');
      } else if (firstNode.type === 'Directive') {
        // Directives in expressions typically return computed values
        actionTypes.add('computed');
      } else {
        // Default to computed for complex expressions
        actionTypes.add('computed');
      }
    }
  }
  
  // If all actions have same type, use that
  if (actionTypes.size === 1) {
    return Array.from(actionTypes)[0];
  }
  
  // Mixed types or unknown - use computed
  return 'computed';
}