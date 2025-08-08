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
  
  // Check all actions for code blocks upfront
  for (let i = 0; i < node.conditions.length; i++) {
    const pair = node.conditions[i];
    if (pair.action && pair.action.length > 0) {
      const hasCodeExecution = pair.action.some(actionNode => {
        if (typeof actionNode === 'object' && actionNode !== null && 'type' in actionNode) {
          return actionNode.type === 'code' || actionNode.type === 'command' || 
                 (actionNode.type === 'nestedDirective' && actionNode.directive === 'run');
        }
        return false;
      });
      
      if (hasCodeExecution) {
        throw new MlldWhenExpressionError(
          'Code blocks are not supported in when expressions. Define your logic in a separate /exe function and call it instead.',
          node.location,
          { conditionIndex: i, phase: 'action', type: 'code-block-not-supported' }
        );
      }
    }
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