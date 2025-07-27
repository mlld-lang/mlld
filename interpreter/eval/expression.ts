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
 * Evaluate binary expressions (&&, ||, ==, !=)
 */
async function evaluateBinaryExpression(node: BinaryExpression, env: Environment): Promise<EvalResult> {
  const { operator, left, right } = node;
  
  // Short-circuit evaluation for logical operators
  if (operator === '&&') {
    const leftResult = await evaluate(left, env);
    const leftTruthy = isTruthy(leftResult.value);
    
    // Short-circuit: if left is falsy, return left value
    if (!leftTruthy) {
      return { value: leftResult.value, env };
    }
    
    // Otherwise evaluate and return right
    const rightResult = await evaluate(right, env);
    return { value: rightResult.value, env };
  }
  
  if (operator === '||') {
    const leftResult = await evaluate(left, env);
    const leftTruthy = isTruthy(leftResult.value);
    
    // Short-circuit: if left is truthy, return left value
    if (leftTruthy) {
      return { value: leftResult.value, env };
    }
    
    // Otherwise evaluate and return right
    const rightResult = await evaluate(right, env);
    return { value: rightResult.value, env };
  }
  
  // Comparison operators - evaluate both sides
  const leftResult = await evaluate(left, env);
  const rightResult = await evaluate(right, env);
  
  if (operator === '==') {
    const equal = mlldEquals(leftResult.value, rightResult.value);
    return { value: equal, env };
  }
  
  if (operator === '!=') {
    const equal = mlldEquals(leftResult.value, rightResult.value);
    return { value: !equal, env };
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
function mlldEquals(a: unknown, b: unknown): boolean {
  // Handle null/undefined equality
  if (a === null || a === undefined) {
    return b === null || b === undefined;
  }
  if (b === null || b === undefined) {
    return false;
  }
  
  // Handle boolean string coercion
  if (typeof a === 'string' && typeof b === 'boolean') {
    return (a === 'true' && b === true) || (a === 'false' && b === false);
  }
  if (typeof b === 'string' && typeof a === 'boolean') {
    return (b === 'true' && a === true) || (b === 'false' && a === false);
  }
  
  // Handle numeric string comparison
  if (typeof a === 'string' && typeof b === 'number') {
    const numA = Number(a);
    return !isNaN(numA) && numA === b;
  }
  if (typeof b === 'string' && typeof a === 'number') {
    const numB = Number(b);
    return !isNaN(numB) && numB === a;
  }
  
  // Default to strict equality
  return a === b;
}