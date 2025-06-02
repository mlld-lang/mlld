import type { WhenNode, WhenSimpleNode, WhenBlockNode, WhenConditionPair } from '@core/types/when';
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { MlldConditionError } from '@core/errors';
import { isWhenSimpleNode, isWhenBlockNode } from '@core/types/when';
import { evaluate } from '../core/interpreter';

/**
 * Evaluates a @when directive.
 * Handles both simple and block forms.
 */
export async function evaluateWhen(
  node: WhenNode,
  env: Environment
): Promise<string> {
  if (isWhenSimpleNode(node)) {
    return evaluateWhenSimple(node, env);
  } else if (isWhenBlockNode(node)) {
    return evaluateWhenBlock(node, env);
  }
  
  throw new MlldConditionError(
    `Unknown when node subtype: ${(node as any).subtype}`,
    'unknown',
    node.location
  );
}

/**
 * Evaluates a simple when directive: @when <condition> => <action>
 */
async function evaluateWhenSimple(
  node: WhenSimpleNode,
  env: Environment
): Promise<string> {
  const conditionResult = await evaluateCondition(node.values.condition, env);
  
  if (conditionResult) {
    // Execute the action if condition is true
    const actionResult = await evaluate(node.values.action, env);
    return actionResult.value || '';
  }
  
  // Return empty string if condition is false
  return '';
}

/**
 * Evaluates a block when directive: @when <var> <modifier>: [...]
 */
async function evaluateWhenBlock(
  node: WhenBlockNode,
  env: Environment
): Promise<string> {
  const modifier = node.meta.modifier;
  const conditions = node.values.conditions;
  
  // Store variable value if specified
  let originalValue: any;
  let variableName: string | undefined;
  
  if (node.values.variable && node.meta.hasVariable) {
    // Extract variable name from the nodes
    const varResult = await evaluate(node.values.variable, env);
    variableName = String(varResult.value || '').trim();
    
    if (variableName) {
      // Store original value to restore later
      originalValue = env.hasVariable(variableName) ? env.getVariable(variableName) : undefined;
    }
  }
  
  // Create a child environment for the when block
  const childEnv = env.createChild();
  
  try {
    switch (modifier) {
      case 'first':
        return await evaluateFirstMatch(conditions, childEnv, variableName);
        
      case 'all':
        return await evaluateAllMatches(conditions, childEnv, variableName);
        
      case 'any':
        return await evaluateAnyMatch(conditions, childEnv, variableName, node.values.action);
        
      default:
        throw new MlldConditionError(
          `Invalid when modifier: ${modifier}`,
          modifier,
          node.location
        );
    }
  } finally {
    // Child environment goes out of scope, no need to clean up variables
  }
}

/**
 * Evaluates conditions using 'first' modifier - executes first matching condition
 */
async function evaluateFirstMatch(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string
): Promise<string> {
  for (const pair of conditions) {
    const conditionResult = await evaluateCondition(pair.condition, env, variableName);
    
    if (conditionResult) {
      if (pair.action) {
        const result = await evaluate(pair.action, env);
        return result.value || '';
      }
      return '';
    }
  }
  
  return '';
}

/**
 * Evaluates conditions using 'all' modifier - executes all matching conditions
 */
async function evaluateAllMatches(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string
): Promise<string> {
  const results: string[] = [];
  
  for (const pair of conditions) {
    const conditionResult = await evaluateCondition(pair.condition, env, variableName);
    
    if (conditionResult && pair.action) {
      const actionResult = await evaluate(pair.action, env);
      if (actionResult.value) {
        results.push(String(actionResult.value));
      }
    }
  }
  
  return results.join('');
}

/**
 * Evaluates conditions using 'any' modifier - executes action if any condition matches
 */
async function evaluateAnyMatch(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string,
  blockAction?: BaseMlldNode[]
): Promise<string> {
  // First check if any condition is true
  let anyMatch = false;
  
  for (const pair of conditions) {
    const conditionResult = await evaluateCondition(pair.condition, env, variableName);
    
    if (conditionResult) {
      anyMatch = true;
      
      // Set variable to the matching condition's value if specified
      if (variableName && pair.condition.length > 0) {
        const conditionResult = await evaluate(pair.condition, env);
        const conditionValue = conditionResult.value;
        
        // Create a variable from the condition value
        const variable = {
          type: typeof conditionValue === 'string' ? 'text' : 'data' as const,
          value: conditionValue,
          nodeId: '',
          location: { line: 0, column: 0 }
        };
        env.setVariable(variableName, variable);
      }
      
      break;
    }
  }
  
  // Execute block action if any condition matched
  if (anyMatch && blockAction) {
    const result = await evaluate(blockAction, env);
    return result.value || '';
  }
  
  return '';
}

/**
 * Evaluates a condition expression to a boolean value
 */
async function evaluateCondition(
  condition: BaseMlldNode[],
  env: Environment,
  variableName?: string
): Promise<boolean> {
  // If a variable name is specified, set it to the condition value for evaluation
  if (variableName) {
    const conditionResult = await evaluate(condition, env);
    const conditionValue = conditionResult.value;
    
    // Create a variable from the condition value
    const variable = {
      type: typeof conditionValue === 'string' ? 'text' : 'data' as const,
      value: conditionValue,
      nodeId: '',
      location: { line: 0, column: 0 }
    };
    env.setVariable(variableName, variable);
  }
  
  // Evaluate the condition
  const result = await evaluate(condition, env);
  
  // Convert result to boolean
  return isTruthy(result.value);
}

/**
 * Determines if a value is truthy according to mlld rules
 */
function isTruthy(value: any): boolean {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return false;
  }
  
  // Handle booleans
  if (typeof value === 'boolean') {
    return value;
  }
  
  // Handle strings
  if (typeof value === 'string') {
    // Empty string is false
    if (value === '') {
      return false;
    }
    
    // String "false" is false (case insensitive)
    if (value.toLowerCase() === 'false') {
      return false;
    }
    
    // String "0" is false
    if (value === '0') {
      return false;
    }
    
    // All other strings are true
    return true;
  }
  
  // Handle numbers
  if (typeof value === 'number') {
    // 0 and NaN are false
    return value !== 0 && !isNaN(value);
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    // Empty array is false
    return value.length > 0;
  }
  
  // Handle objects
  if (typeof value === 'object') {
    // Empty object is false
    return Object.keys(value).length > 0;
  }
  
  // Default to true for other types
  return true;
}