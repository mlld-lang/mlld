import type { WhenNode, WhenSimpleNode, WhenBlockNode, WhenSwitchNode, WhenConditionPair } from '@core/types/when';
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { Variable } from '@core/types/variable';
import { MlldConditionError } from '@core/errors';
import { isWhenSimpleNode, isWhenBlockNode, isWhenSwitchNode } from '@core/types/when';
import { evaluate } from '../core/interpreter';
import {
  isTextLike,
  isArray as isArrayVariable,
  isObject as isObjectVariable,
  isCommandResult,
  isPipelineInput
} from '@core/types/variable';

/**
 * Compares two values according to mlld's when comparison rules
 */
function compareValues(expressionValue: any, conditionValue: any): boolean {
  // Both null/undefined
  if ((expressionValue === null || expressionValue === undefined) &&
      (conditionValue === null || conditionValue === undefined)) {
    return true;
  }
  // String comparison - case sensitive
  else if (typeof expressionValue === 'string' && typeof conditionValue === 'string') {
    return expressionValue === conditionValue;
  }
  // Boolean comparison
  else if (typeof expressionValue === 'boolean' && typeof conditionValue === 'boolean') {
    return expressionValue === conditionValue;
  }
  // Number comparison
  else if (typeof expressionValue === 'number' && typeof conditionValue === 'number') {
    return expressionValue === conditionValue;
  }
  // String-boolean comparison: "true"/"false" matches true/false
  else if (typeof expressionValue === 'string' && typeof conditionValue === 'boolean') {
    return (expressionValue === 'true' && conditionValue === true) ||
           (expressionValue === 'false' && conditionValue === false);
  }
  else if (typeof expressionValue === 'boolean' && typeof conditionValue === 'string') {
    return (expressionValue === true && conditionValue === 'true') ||
           (expressionValue === false && conditionValue === 'false');
  }
  // Truthy comparison - if condition is boolean literal
  else if (typeof conditionValue === 'boolean') {
    return isTruthy(expressionValue) === conditionValue;
  }
  // Direct equality for other cases
  else {
    return expressionValue === conditionValue;
  }
}

/**
 * Evaluates a @when directive.
 * Handles simple, switch, and block forms.
 */
export async function evaluateWhen(
  node: WhenNode,
  env: Environment
): Promise<EvalResult> {
  if (isWhenSimpleNode(node)) {
    return evaluateWhenSimple(node, env);
  } else if (isWhenSwitchNode(node)) {
    return evaluateWhenSwitch(node, env);
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
  
  if (process.env.DEBUG_WHEN) {
    console.log('When condition result:', conditionResult);
  }
  
  if (conditionResult) {
    // Execute the action if condition is true
    const result = await evaluate(node.values.action, env);
    if (process.env.DEBUG_WHEN) {
      console.log('When action result:', result);
    }
    return result;
  }
  
  // Return empty string if condition is false
  return { value: '', env };
}

/**
 * Evaluates a switch when directive: @when <expression>: [value => action, ...]
 * Evaluates the expression once and matches its result against condition values
 */
async function evaluateWhenSwitch(
  node: WhenSwitchNode,
  env: Environment
): Promise<EvalResult> {
  // Evaluate the expression once without producing output
  // For simple text nodes, extract the value directly
  let expressionValue: any;
  if (node.values.expression.length === 1 && node.values.expression[0].type === 'Text') {
    expressionValue = node.values.expression[0].content;
  } else {
    const expressionResult = await evaluate(node.values.expression, env);
    expressionValue = expressionResult.value;
  }
  
  // Create a child environment for the switch block
  const childEnv = env.createChild();
  
  try {
    // Check each condition value against the expression result
    for (const pair of node.values.conditions) {
      // Check if this is a negation node
      let isNegated = false;
      let actualCondition = pair.condition;
      
      if (actualCondition.length === 1 && actualCondition[0].type === 'Negation') {
        isNegated = true;
        const negationNode = actualCondition[0] as any;
        actualCondition = negationNode.condition;
      }
      
      // Evaluate the condition value without producing output
      // For simple text nodes, extract the value directly
      let conditionValue: any;
      if (actualCondition.length === 1 && actualCondition[0].type === 'Text') {
        conditionValue = actualCondition[0].content;
      } else {
        // For more complex conditions, evaluate them
        const conditionResult = await evaluate(actualCondition, childEnv);
        conditionValue = conditionResult.value;
      }
      
      // Compare values using shared logic
      let matches = compareValues(expressionValue, conditionValue);
      
      // Apply negation if needed
      if (isNegated) {
        matches = !matches;
      }
      
      if (matches && pair.action) {
        // Handle action which might be an array of nodes
        const actionNodes = Array.isArray(pair.action) ? pair.action : [pair.action];
        for (const actionNode of actionNodes) {
          await evaluate(actionNode, childEnv);
        }
        // Merge child environment nodes back to parent
        env.mergeChild(childEnv);
        // For @when, we don't want to propagate the action's output value to the document
        // The action should have already done what it needs to do (like @output writing to a file)
        return { value: '', env };
      }
    }
    
    // No match found
    return { value: '', env };
  } finally {
    // Child environment goes out of scope
  }
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
  
  // For comparison-based modifiers (first, any, all), we need the expression to compare against
  let expressionNodes: BaseMlldNode[] | undefined;
  
  // Store variable value if specified
  let originalValue: any;
  let variableName: string | undefined;
  
  
  if (node.values.variable && node.meta.hasVariable) {
    // The variable nodes contain the expression to evaluate
    expressionNodes = node.values.variable;
    
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
        result = await evaluateFirstMatch(conditions, childEnv, variableName, expressionNodes);
        break;
        
      case 'all':
        result = await evaluateAllMatches(conditions, childEnv, variableName, node.values.action);
        break;
        
      case 'any':
        result = await evaluateAnyMatch(conditions, childEnv, variableName, node.values.action);
        break;
        
      case 'default':
        // Bare @when behavior depends on whether there's a block action
        if (node.values.action) {
          // With block action: behave like 'all:' - execute action if ALL conditions are true
          result = await evaluateAllMatches(conditions, childEnv, variableName, node.values.action);
        } else {
          // Without block action: execute all matching individual actions
          result = await evaluateAllMatches(conditions, childEnv, variableName);
        }
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
    
    // If the when evaluation produced output content, add it to the document
    if (result.value && typeof result.value === 'string' && result.value.trim()) {
      const textNode = {
        type: 'Text' as const,
        nodeId: `${node.nodeId || 'when'}-output`,
        content: result.value
      };
      env.addNode(textNode);
    }
    
    // Return the result value so unit tests can verify the output
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
  variableName?: string,
  expressionNodes?: BaseMlldNode[]
): Promise<EvalResult> {
  // If we have expression nodes, evaluate them to get the value to compare against
  let expressionValue: any;
  if (expressionNodes && expressionNodes.length > 0) {
    
    if (expressionNodes.length === 1 && expressionNodes[0].type === 'Text') {
      expressionValue = (expressionNodes[0] as any).content;
    } else if (expressionNodes.length === 1 && expressionNodes[0].type === 'VariableReference') {
      // For variable references, get the actual value, not the output
      const varRef = expressionNodes[0] as any;
      const variable = env.getVariable(varRef.identifier);
      if (variable) {
        expressionValue = variable.value;
      }
      
    } else {
      const expressionResult = await evaluate(expressionNodes, env);
      expressionValue = expressionResult.value;
      
    }
  }
  
  for (const pair of conditions) {
    let matches = false;
    
    if (expressionValue !== undefined) {
      // Compare expression value against condition value (like switch mode)
      let conditionValue: any;
      
      // Check for negation
      let isNegated = false;
      let actualCondition = pair.condition;
      
      if (actualCondition.length === 1 && actualCondition[0].type === 'Negation') {
        isNegated = true;
        const negationNode = actualCondition[0] as any;
        actualCondition = negationNode.condition;
      }
      
      // Evaluate the condition value
      if (actualCondition.length === 1 && actualCondition[0].type === 'Text') {
        conditionValue = (actualCondition[0] as any).content;
      } else {
        const conditionResult = await evaluate(actualCondition, env);
        conditionValue = conditionResult.value;
      }
      
      // Compare values using shared logic
      matches = compareValues(expressionValue, conditionValue);
      
      
      // Apply negation if needed
      if (isNegated) {
        matches = !matches;
      }
    } else {
      // No expression value, fall back to truthiness evaluation
      matches = await evaluateCondition(pair.condition, env, variableName);
    }
    
    if (matches) {
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
        'Invalid @when syntax: \'all:\' modifier cannot have individual actions for conditions when using a block action. Use either individual actions OR a block action after the conditions: @when all: [...] => @add "action"',
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
      'Invalid @when syntax: \'any:\' modifier cannot have individual actions for conditions. Use a block action after the conditions instead: @when any: [...] => @add "action"',
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
  // Check if this is a negation node
  if (condition.length === 1 && condition[0].type === 'Negation') {
    const negationNode = condition[0] as any;
    const innerCondition = negationNode.condition;
    
    // Evaluate the inner condition and negate the result
    const innerResult = await evaluateCondition(innerCondition, env, variableName);
    return !innerResult;
  }
  
  // Create a child environment for condition evaluation
  const childEnv = env.createChild();
  
  // If a variable name is specified, set it to the condition value for evaluation
  if (variableName) {
    const variable = env.getVariable(variableName);
    if (variable) {
      // Set the _whenValue context for built-in functions
      childEnv.setVariable('_whenValue', variable);
    }
  }
  
  if (process.env.DEBUG_WHEN) {
    console.log('Evaluating condition:', condition);
  }
  
  // Evaluate the condition
  const result = await evaluate(condition, childEnv);
  
  if (process.env.DEBUG_WHEN) {
    console.log('Condition evaluation result:', JSON.stringify(result, null, 2));
  }
  
  // For command execution results, check stdout or exit code
  if (result.stdout !== undefined) {
    // This is a command execution result
    // First check exit code - 0 is true, non-zero is false
    if (result.exitCode !== undefined && result.exitCode !== 0) {
      return false;
    }
    // If we have a parsed value (from exec functions with return values), use that
    // This handles the case where JSON stringified empty string '""' should be falsy
    if (result.value !== undefined && result.value !== result.stdout) {
      return isTruthy(result.value);
    }
    // Otherwise check stdout - trim whitespace
    const trimmedStdout = result.stdout.trim();
    if (process.env.DEBUG_WHEN) {
      console.log('Trimmed stdout for truthiness:', JSON.stringify(trimmedStdout));
    }
    return isTruthy(trimmedStdout);
  }
  
  // Convert result to boolean
  return isTruthy(result.value);
}

/**
 * Determines if a value is truthy according to mlld rules
 */
function isTruthy(value: any): boolean {
  // Handle Variable types
  if (value && typeof value === 'object' && 'type' in value && 'name' in value) {
    const variable = value as Variable;
    
    // Type-specific truthiness for Variables
    if (isTextLike(variable)) {
      return variable.value.length > 0;
    } else if (isArrayVariable(variable)) {
      return variable.value.length > 0;
    } else if (isObjectVariable(variable)) {
      return Object.keys(variable.value).length > 0;
    } else if (isCommandResult(variable)) {
      // Command results are truthy if they have output
      return variable.value.trim().length > 0;
    } else if (isPipelineInput(variable)) {
      return variable.value.text.length > 0;
    }
    
    // For other variable types, use their value
    return isTruthy(variable.value);
  }
  
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