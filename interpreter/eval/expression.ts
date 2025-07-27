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
    return value.length > 0;
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
  env: Environment
): Promise<EvalResult> {
  console.log('[DEBUG] evaluateExpression called with node type:', node.type);
  
  if (node.type === 'BinaryExpression') {
    return evaluateBinaryExpression(node, env);
  } else if (node.type === 'TernaryExpression') {
    return evaluateTernaryExpression(node, env);
  } else if (node.type === 'UnaryExpression') {
    return evaluateUnaryExpression(node, env);
  }
  
  throw new Error(`Unknown expression type: ${(node as any).type}`);
}

/**
 * Evaluate binary expressions (&&, ||, ==, !=, <, >, <=, >=)
 */
async function evaluateBinaryExpression(node: BinaryExpression, env: Environment): Promise<EvalResult> {
  const { operator, left, right } = node;
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('[DEBUG] evaluateBinaryExpression:', {
      operator,
      leftType: left.type,
      rightType: right.type,
      left: left.type === 'VariableReference' ? (left as any).identifier : left,
      right: right.type === 'VariableReference' ? (right as any).identifier : right
    });
  }
  
  // Short-circuit evaluation for logical operators
  const expressionContext = { isExpression: true };
  
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
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('[DEBUG] Evaluated operands:', {
      leftResult: leftResult.value,
      rightResult: rightResult.value,
      leftIsVariable: leftResult.value && typeof leftResult.value === 'object' && 'type' in leftResult.value,
      rightIsVariable: rightResult.value && typeof rightResult.value === 'object' && 'type' in rightResult.value
    });
  }
  
  if (operator === '==') {
    const equal = isEqual(leftResult.value, rightResult.value);
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('[DEBUG] == comparison:', {
        left: leftResult.value,
        leftType: typeof leftResult.value,
        right: rightResult.value,
        rightType: typeof rightResult.value,
        equal
      });
    }
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
    console.log('[DEBUG] < comparison:', leftResult.value, '<', rightResult.value, '=', leftNum < rightNum);
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
async function evaluateTernaryExpression(node: TernaryExpression, env: Environment): Promise<EvalResult> {
  const { condition, trueBranch, falseBranch } = node;
  
  // Evaluate condition
  const condResult = await evaluate(condition, env);
  const condTruthy = isTruthy(condResult.value);
  
  // Evaluate and return appropriate branch
  if (condTruthy) {
    return evaluate(trueBranch, env);
  } else {
    return evaluate(falseBranch, env);
  }
}

/**
 * Evaluate unary expressions (!)
 */
async function evaluateUnaryExpression(node: UnaryExpression, env: Environment): Promise<EvalResult> {
  const { operator, operand } = node;
  
  if (operator === '!') {
    const operandResult = await evaluate(operand, env);
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
    return variable.value;
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
  // Handle Variable objects by extracting their value
  if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
    const variable = value as Variable;
    return toNumber(variable.value);
  }
  
  // Handle null and undefined
  if (value === null) {
    return 0;
  }
  if (value === undefined) {
    return NaN;
  }
  
  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  
  // Handle numbers
  if (typeof value === 'number') {
    return value;
  }
  
  // Handle strings
  if (typeof value === 'string') {
    // Special case for boolean strings
    if (value === 'true') {
      return 1;
    }
    if (value === 'false') {
      return 0;
    }
    // Try to parse as number
    const num = Number(value);
    return num;
  }
  
  // For objects and arrays, return NaN
  return NaN;
}