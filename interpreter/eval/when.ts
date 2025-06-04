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
): Promise<EvalResult> {
  if (isWhenSimpleNode(node)) {
    return evaluateWhenSimple(node, env);
  } else if (isWhenBlockNode(node)) {
    return evaluateWhenBlock(node, env);
  }
  
  throw new MlldConditionError(
    `Unknown when node subtype: ${(node as any).subtype}`,
    undefined,
    node.location
  );
}

/**
 * Evaluates a simple when directive: @when <condition> => <action>
 */
async function evaluateWhenSimple(
  node: WhenSimpleNode,
  env: Environment
): Promise<EvalResult> {
  const conditionResult = await evaluateCondition(node.values.condition, env);
  
  if (conditionResult) {
    // Execute the action if condition is true
    return await evaluate(node.values.action, env);
  }
  
  // Return empty string if condition is false
  return { value: '', env };
}

/**
 * Evaluates a block when directive: @when <var> <modifier>: [...]
 */
async function evaluateWhenBlock(
  node: WhenBlockNode,
  env: Environment
): Promise<EvalResult> {
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
    let result: EvalResult;
    
    switch (modifier) {
      case 'first':
        result = await evaluateFirstMatch(conditions, childEnv, variableName);
        break;
        
      case 'all':
        result = await evaluateAllMatches(conditions, childEnv, variableName, node.values.action);
        break;
        
      case 'any':
        result = await evaluateAnyMatch(conditions, childEnv, variableName, node.values.action);
        break;
        
      case 'default':
        // Bare @when executes all matching conditions (like 'all' with individual actions)
        result = await evaluateAllMatches(conditions, childEnv, variableName);
        break;
        
      default:
        throw new MlldConditionError(
          `Invalid when modifier: ${modifier}`,
          modifier as 'first' | 'all' | 'any' | 'default',
          node.location
        );
    }
    
    // Merge child environment nodes back to parent
    // This ensures output nodes created by actions are preserved
    env.mergeChild(childEnv);
    
    return result;
  } finally {
    // Child environment goes out of scope
  }
}

/**
 * Evaluates conditions using 'first' modifier - executes first matching condition
 */
async function evaluateFirstMatch(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string
): Promise<EvalResult> {
  for (const pair of conditions) {
    const conditionResult = await evaluateCondition(pair.condition, env, variableName);
    
    if (conditionResult) {
      if (pair.action) {
        const result = await evaluate(pair.action, env);
        // The action has already added its output nodes during evaluation
        // Just return the result
        return result;
      }
      return { value: '', env };
    }
  }
  
  return { value: '', env };
}

/**
 * Evaluates conditions using 'all' modifier
 * If blockAction is provided, executes it only if ALL conditions are true
 * Otherwise, executes individual actions for each true condition
 */
async function evaluateAllMatches(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string,
  blockAction?: BaseMlldNode[]
): Promise<EvalResult> {
  // If we have a block action, check if ALL conditions are true first
  if (blockAction) {
    // Check for invalid syntax: all: with block action cannot have individual actions
    if (conditions.some(pair => pair.action)) {
      throw new MlldConditionError(
        "Invalid @when syntax: 'all:' modifier cannot have individual actions for conditions when using a block action. Use either individual actions OR a block action after the conditions: @when all: [...] => @add \"action\"",
        'all',
        undefined
      );
    }
    
    let allMatch = true;
    
    for (const pair of conditions) {
      const conditionResult = await evaluateCondition(pair.condition, env, variableName);
      
      if (!conditionResult) {
        allMatch = false;
        break;
      }
    }
    
    // Execute block action only if all conditions matched
    if (allMatch) {
      return await evaluate(blockAction, env);
    }
    
    return { value: '', env };
  }
  
  // Otherwise, execute individual actions for each true condition
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
  
  return { value: results.join(''), env };
}

/**
 * Evaluates conditions using 'any' modifier - executes action if any condition matches
 */
async function evaluateAnyMatch(
  conditions: WhenConditionPair[],
  env: Environment,
  variableName?: string,
  blockAction?: BaseMlldNode[]
): Promise<EvalResult> {
  // Check for invalid syntax: any: cannot have individual actions
  if (conditions.some(pair => pair.action)) {
    throw new MlldConditionError(
      "Invalid @when syntax: 'any:' modifier cannot have individual actions for conditions. Use a block action after the conditions instead: @when any: [...] => @add \"action\"",
      'any',
      undefined
    );
  }
  
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
    return await evaluate(blockAction, env);
  }
  
  return { value: '', env };
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
  
  // For command execution results, check stdout or exit code
  if (result.stdout !== undefined) {
    // This is a command execution result
    // First check exit code - 0 is true, non-zero is false
    if (result.exitCode !== undefined && result.exitCode !== 0) {
      return false;
    }
    // Then check stdout - trim whitespace
    return isTruthy(result.stdout.trim());
  }
  
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