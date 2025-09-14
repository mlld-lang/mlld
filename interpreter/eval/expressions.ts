import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError } from '../../core/errors/MlldDirectiveError';
import { isEqual, toNumber, isTruthy } from './expression';

/**
 * Unified expression evaluator for all expression types from the unified grammar
 * Handles: BinaryExpression, UnaryExpression, TernaryExpression, ArrayFilterExpression, ArraySliceExpression, Literal nodes
 */
export async function evaluateUnifiedExpression(node: any, env: Environment): Promise<any> {
  try {
    switch (node.type) {
      case 'BinaryExpression':
        return await evaluateBinaryExpression(node, env);
      case 'UnaryExpression':
        return await evaluateUnaryExpression(node, env);
      case 'TernaryExpression':
        return await evaluateTernaryExpression(node, env);
      case 'ArrayFilterExpression':
        return await evaluateArrayFilterExpression(node, env);
      case 'ArraySliceExpression':
        return await evaluateArraySliceExpression(node, env);
      case 'Literal':
        // Handle none literal (only valid in when context)
        if (node.valueType === 'none') {
          throw new Error('The "none" keyword can only be used as a condition in /when directives');
        }
        return node.value;
      case 'VariableReference':
        // Delegate variable references to the standard evaluator
        try {
          const varResult = await evaluate(node, env);
          return varResult.value;
        } catch (error) {
          // Handle undefined variables gracefully for backward compatibility
          if (error.message && error.message.includes('Variable not found')) {
            return undefined;
          }
          throw error;
        }
      case 'ExecReference':
        // Delegate exec references to the standard evaluator
        const execResult = await evaluate(node, env);
        return execResult.value;
      case 'Text':
        // Handle text nodes that might appear in expressions
        return node.content;
      default:
        // For all other node types, delegate to the standard evaluator
        const result = await evaluate(node, env);
        return result.value;
    }
  } catch (error) {
    throw new MlldDirectiveError(
      `Expression evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      'expression',
      {
        location: (node as any)?.location,
        cause: error as Error,
        context: { nodeType: (node as any)?.type, operator: (node as any)?.operator },
        env
      }
    );
  }
}

/**
 * Evaluate binary expressions (&&, ||, ==, !=, <, >, <=, >=, ~=)
 */
async function evaluateBinaryExpression(node: any, env: Environment): Promise<any> {
  let { operator } = node;
  
  // Handle operator being an array (from PEG.js negative lookahead)
  if (Array.isArray(operator)) {
    operator = operator[0];
  }
  
  
  
  const leftResult = await evaluateUnifiedExpression(node.left, env);
  
  // Short-circuit evaluation for logical operators  
  if (operator === '&&') {
    const leftTruthy = isTruthy(leftResult);
    if (!leftTruthy) {
      // Short-circuit: if left is falsy, return left value
      return leftResult;
    }
    // Otherwise evaluate and return right
    const rightResult = await evaluateUnifiedExpression(node.right, env);
    return rightResult;
  }
  
  if (operator === '||') {
    const leftTruthy = isTruthy(leftResult);
    if (leftTruthy) {
      // Short-circuit: if left is truthy, return left value
      return leftResult;
    }
    // Otherwise evaluate and return right
    const rightResult = await evaluateUnifiedExpression(node.right, env);
    return rightResult;
  }
  
  const rightResult = await evaluateUnifiedExpression(node.right, env);
  
  
  switch (operator) {
    case '==':
      const equal = isEqual(leftResult, rightResult);
      return equal;
    case '!=':
      return !isEqual(leftResult, rightResult);
    case '~=':
      // Regex match operator
      const regex = new RegExp(String(rightResult));
      return regex.test(String(leftResult));
    case '<':
      const leftNum = toNumber(leftResult);
      const rightNum = toNumber(rightResult);
      const ltResult = leftNum < rightNum;
      return ltResult;
    case '>':
      return toNumber(leftResult) > toNumber(rightResult);
    case '<=':
      return toNumber(leftResult) <= toNumber(rightResult);
    case '>=':
      return toNumber(leftResult) >= toNumber(rightResult);
    case '+':
      return toNumber(leftResult) + toNumber(rightResult);
    case '-':
      return toNumber(leftResult) - toNumber(rightResult);
    case '*':
      return toNumber(leftResult) * toNumber(rightResult);
    case '/':
      return toNumber(leftResult) / toNumber(rightResult);
    case '%':
      return toNumber(leftResult) % toNumber(rightResult);
    default:
      throw new Error(`Unknown binary operator: ${operator}`);
  }
}

/**
 * Evaluate unary expressions (!, -, +)
 */
async function evaluateUnaryExpression(node: any, env: Environment): Promise<any> {
  const operandResult = await evaluateUnifiedExpression(node.operand, env);
  
  switch (node.operator) {
    case '!':
      return !isTruthy(operandResult);
    case '-':
      return -toNumber(operandResult);
    case '+':
      return +toNumber(operandResult);
    default:
      throw new Error(`Unknown unary operator: ${node.operator}`);
  }
}

/**
 * Evaluate ternary expressions (condition ? trueBranch : falseBranch)
 */
async function evaluateTernaryExpression(node: any, env: Environment): Promise<any> {
  const conditionResult = await evaluateUnifiedExpression(node.condition, env);
  
  return isTruthy(conditionResult)
    ? await evaluateUnifiedExpression(node.trueBranch, env)
    : await evaluateUnifiedExpression(node.falseBranch, env);
}

/**
 * Evaluate array filter expressions: @array[?condition]
 */
async function evaluateArrayFilterExpression(node: any, env: Environment): Promise<any[]> {
  const array = await evaluateUnifiedExpression(node.array, env);
  
  if (!Array.isArray(array)) {
    throw new Error(`Cannot filter non-array value: ${typeof array}`);
  }
  
  const results = [];
  for (const item of array) {
    // Create new environment with current item accessible as '$'
    const itemEnv = env.withVariable('$', item);
    const passes = await evaluateUnifiedExpression(node.filter, itemEnv);
    if (passes) {
      results.push(item);
    }
  }
  
  return results;
}

/**
 * Evaluate array slice expressions: @array[start:end]
 */
async function evaluateArraySliceExpression(node: any, env: Environment): Promise<any[]> {
  const array = await evaluateUnifiedExpression(node.array, env);
  
  if (!Array.isArray(array)) {
    throw new Error(`Cannot slice non-array value: ${typeof array}`);
  }
  
  const start = node.start || 0;
  const end = node.end !== undefined ? node.end : array.length;
  
  return array.slice(start, end);
}

/**
 * Check if a node is a unified expression type
 */
export function isUnifiedExpressionNode(node: any): boolean {
  return node && [
    'BinaryExpression',
    'UnaryExpression', 
    'TernaryExpression',
    'ArrayFilterExpression',
    'ArraySliceExpression',
    'Literal'
  ].includes(node.type);
}

/**
 * Helper function to evaluate array filter expressions
 * This will be expanded when we implement array operations
 */
export async function evaluateArrayFilter(array: any[], filter: any, env: Environment): Promise<any[]> {
  const results = [];
  for (const item of array) {
    // Create a new environment with the current item as '$'
    const itemEnv = env.withVariable('$', item);
    const passes = await evaluateUnifiedExpression(filter, itemEnv);
    if (passes) results.push(item);
  }
  return results;
}
