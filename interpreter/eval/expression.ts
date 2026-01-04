import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { MlldNode, BinaryExpression, TernaryExpression, UnaryExpression } from '@core/types';
import type { Variable } from '@core/types/variable';
import { evaluate } from '../core/interpreter';
import { 
  isTextLike, 
  isArray as isArrayVariable, 
  isObject as isObjectVariable, 
  isCommandResult, 
  isPipelineInput 
} from '@core/types/variable';
import { asText, assertStructuredValue, isStructuredValue } from '../utils/structured-value';
import { executeParallelExecInvocations } from './helpers/parallel-exec';

/**
 * Determines if a value is truthy according to mlld rules
 * (copied from when.ts to avoid circular dependencies)
 */
export function isTruthy(value: any): boolean {
  // Handle Variable types
  if (value && typeof value === 'object' && 'type' in value && 'name' in value) {
    const variable = value as Variable;
    
    // Type-specific truthiness for Variables
    if (isTextLike(variable)) {
      // Check for mlld falsy string values
      const str = variable.value;
      if (str === '' || str.toLowerCase() === 'false' || str === '0') {
        return false;
      }
      return true;
    } else if (isArrayVariable(variable)) {
      return variable.value.length > 0;
    } else if (isObjectVariable(variable)) {
      return Object.keys(variable.value).length > 0;
    } else if (isCommandResult(variable)) {
      // Command results are truthy if they have output
      return variable.value.trim().length > 0;
    } else if (isPipelineInput(variable)) {
      assertStructuredValue(variable.value, 'expression:isTruthy:pipeline-input');
      return asText(variable.value).length > 0;
    }
    
    // For other variable types, use their value
    return isTruthy(variable.value);
  }
  
  // Handle direct values
  if (value === null || value === undefined) {
    return false;
  }
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'number') {
    return value !== 0 && !isNaN(value);
  }
  
  if (typeof value === 'string') {
    // Wildcard is always true
    if (value === '*') {
      return true;
    }
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
  
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  
  // Default to JavaScript truthiness
  return !!value;
}

/**
 * Evaluate expression nodes (BinaryExpression, TernaryExpression, UnaryExpression)
 */
export async function evaluateExpression(
  node: BinaryExpression | TernaryExpression | UnaryExpression,
  env: Environment,
  context?: { isExpression?: boolean }
): Promise<EvalResult> {
  
  if (node.type === 'BinaryExpression') {
    return evaluateBinaryExpression(node, env, context);
  } else if (node.type === 'TernaryExpression') {
    return evaluateTernaryExpression(node, env, context);
  } else if (node.type === 'UnaryExpression') {
    return evaluateUnaryExpression(node, env, context);
  }
  
  throw new Error(`Unknown expression type: ${(node as any).type}`);
}

/**
 * Evaluate binary expressions (&&, ||, ==, !=, <, >, <=, >=)
 */
async function evaluateBinaryExpression(node: BinaryExpression, env: Environment, context?: { isExpression?: boolean }): Promise<EvalResult> {
  let { operator, left, right } = node;
  
  // Handle operator being an array (from PEG.js negative lookahead)
  if (Array.isArray(operator)) {
    operator = operator[0];
  }
  
  const isExecParallel =
    operator === '||' &&
    left?.type === 'ExecInvocation' &&
    right?.type === 'ExecInvocation';
  if (isExecParallel) {
    const { value } = await executeParallelExecInvocations(left, right, env);
    return { value, env };
  }
  
  // Short-circuit evaluation for logical operators
  const expressionContext = { isExpression: true, ...context };
  
  if (operator === '&&') {
    const leftResult = await evaluate(left, env, expressionContext);
    const leftTruthy = isTruthy(leftResult.value);
    
    // Short-circuit: if left is falsy, return left value
    if (!leftTruthy) {
      return { value: leftResult.value, env };
    }
    
    // Otherwise evaluate and return right
    const rightResult = await evaluate(right, env, expressionContext);
    return { value: rightResult.value, env };
  }
  
  if (operator === '||') {
    const leftResult = await evaluate(left, env, expressionContext);
    const leftTruthy = isTruthy(leftResult.value);
    
    
    // Short-circuit: if left is truthy, return left value
    if (leftTruthy) {
      return { value: leftResult.value, env };
    }
    
    // Otherwise evaluate and return right
    const rightResult = await evaluate(right, env, expressionContext);
    return { value: rightResult.value, env };
  }
  
  // Comparison operators - evaluate both sides
  const leftResult = await evaluate(left, env, expressionContext);
  const rightResult = await evaluate(right, env, expressionContext);
  
  
  if (operator === '==') {
    const equal = isEqual(leftResult.value, rightResult.value);
    return { value: equal, env };
  }
  
  if (operator === '!=') {
    const equal = isEqual(leftResult.value, rightResult.value);
    return { value: !equal, env };
  }
  
  // Numeric comparison operators
  if (operator === '<') {
    const leftNum = toNumber(leftResult.value);
    const rightNum = toNumber(rightResult.value);
    return { value: leftNum < rightNum, env };
  }
  
  if (operator === '>') {
    const leftNum = toNumber(leftResult.value);
    const rightNum = toNumber(rightResult.value);
    return { value: leftNum > rightNum, env };
  }
  
  if (operator === '<=') {
    const leftNum = toNumber(leftResult.value);
    const rightNum = toNumber(rightResult.value);
    return { value: leftNum <= rightNum, env };
  }
  
  if (operator === '>=') {
    const leftNum = toNumber(leftResult.value);
    const rightNum = toNumber(rightResult.value);
    return { value: leftNum >= rightNum, env };
  }
  
  throw new Error(`Unknown binary operator: ${operator}`);
}

/**
 * Evaluate ternary expressions (condition ? trueBranch : falseBranch)
 */
async function evaluateTernaryExpression(node: TernaryExpression, env: Environment, context?: { isExpression?: boolean }): Promise<EvalResult> {
  const { condition, trueBranch, falseBranch } = node;
  
  // Evaluate condition
  const condResult = await evaluate(condition, env, { isExpression: true, ...context });
  const condTruthy = isTruthy(condResult.value);
  
  // Evaluate and return appropriate branch
  if (condTruthy) {
    return evaluate(trueBranch, env, { isExpression: true, ...context });
  } else {
    return evaluate(falseBranch, env, { isExpression: true, ...context });
  }
}

/**
 * Evaluate unary expressions (!)
 */
async function evaluateUnaryExpression(node: UnaryExpression, env: Environment, context?: { isExpression?: boolean }): Promise<EvalResult> {
  const { operator, operand } = node;
  
  if (operator === '!') {
    const operandResult = await evaluate(operand, env, { isExpression: true, ...context });
    const operandTruthy = isTruthy(operandResult.value);
    return { value: !operandTruthy, env };
  }
  
  throw new Error(`Unknown unary operator: ${operator}`);
}

/**
 * mlld equality comparison
 * Follows mlld's type coercion rules:
 * - "true" == true
 * - "false" == false  
 * - null == undefined
 * - Numbers are compared numerically
 * - Strings are compared as strings
 */
export function isEqual(a: unknown, b: unknown): boolean {
  // Extract Variable values
  const aValue = extractValue(a);
  const bValue = extractValue(b);
  
  // Handle null/undefined equality
  if (aValue === null || aValue === undefined) {
    return bValue === null || bValue === undefined;
  }
  if (bValue === null || bValue === undefined) {
    return false;
  }
  
  // Handle boolean string coercion
  if (typeof aValue === 'string' && typeof bValue === 'boolean') {
    return (aValue === 'true' && bValue === true) || (aValue === 'false' && bValue === false);
  }
  if (typeof bValue === 'string' && typeof aValue === 'boolean') {
    return (bValue === 'true' && aValue === true) || (bValue === 'false' && aValue === false);
  }
  
  // Handle numeric string comparison
  if (typeof aValue === 'string' && typeof bValue === 'number') {
    const numA = Number(aValue);
    return !isNaN(numA) && numA === bValue;
  }
  if (typeof bValue === 'string' && typeof aValue === 'number') {
    const numB = Number(bValue);
    return !isNaN(numB) && numB === aValue;
  }
  
  // Default to strict equality
  return aValue === bValue;
}

/**
 * Extract the raw value from a Variable or return the value as-is
 */
function extractValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
    const variable = value as Variable;
    return extractValue(variable.value);
  }
  if (isStructuredValue(value)) {
    return value.data ?? value.text;
  }
  return value;
}

/**
 * Convert a value to a number for numeric comparisons
 * Follows mlld's type coercion rules:
 * - Parse strings to numbers
 * - true → 1, false → 0
 * - null → 0, undefined → NaN
 * - Non-numeric strings → NaN
 */
export function toNumber(value: unknown): number {
  // Use extractValue to handle both Variables and StructuredValues
  const extracted = extractValue(value);

  // Handle null and undefined
  if (extracted === null) {
    return 0;
  }
  if (extracted === undefined) {
    return NaN;
  }

  // Handle booleans
  if (typeof extracted === 'boolean') {
    return extracted ? 1 : 0;
  }

  // Handle numbers
  if (typeof extracted === 'number') {
    return extracted;
  }

  // Handle strings
  if (typeof extracted === 'string') {
    // Special case for boolean strings
    if (extracted === 'true') {
      return 1;
    }
    if (extracted === 'false') {
      return 0;
    }
    // Try to parse as number
    const num = Number(extracted);
    return num;
  }

  // For objects and arrays, return NaN
  return NaN;
}
