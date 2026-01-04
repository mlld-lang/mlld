import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError } from '../../core/errors/MlldDirectiveError';
import { isEqual, toNumber, isTruthy } from './expression';
import {
  createEvaluatorResult,
  mergeEvaluatorDescriptors,
  type EvaluatorResult
} from '../utils/evaluator-result';
import { executeParallelExecInvocations } from './helpers/parallel-exec';

/**
 * Unified expression evaluator for all expression types from the unified grammar
 * Handles: BinaryExpression, UnaryExpression, TernaryExpression, ArrayFilterExpression, ArraySliceExpression, Literal nodes
 */
export async function evaluateUnifiedExpression(
  node: any,
  env: Environment
): Promise<EvaluatorResult> {
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
        return createEvaluatorResult(node.value);
      case 'VariableReference':
        // Delegate variable references to the standard evaluator
        try {
          const varResult = await evaluate(node, env);
          return createEvaluatorResult(varResult.value);
        } catch (error) {
          // Handle undefined variables gracefully for backward compatibility
          if (error instanceof Error && error.message.includes('Variable not found')) {
            return createEvaluatorResult(undefined);
          }
          throw error;
        }
      case 'ExecReference':
        // Delegate exec references to the standard evaluator
        const execResult = await evaluate(node, env);
        return createEvaluatorResult(execResult.value);
      case 'Text':
        // Handle text nodes that might appear in expressions
        return createEvaluatorResult(node.content);
      default:
        // For all other node types, delegate to the standard evaluator
        const result = await evaluate(node, env);
        return createEvaluatorResult(result.value);
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
async function evaluateBinaryExpression(
  node: any,
  env: Environment
): Promise<EvaluatorResult> {
  let { operator } = node;
  
  // Handle operator being an array (from PEG.js negative lookahead)
  if (Array.isArray(operator)) {
    operator = operator[0];
  }
  
  const isExecParallel =
    operator === '||' &&
    node.left?.type === 'ExecInvocation' &&
    node.right?.type === 'ExecInvocation';
  if (isExecParallel) {
    const { value, descriptor } = await executeParallelExecInvocations(node.left, node.right, env);
    return createEvaluatorResult(value, descriptor);
  }
  
  const leftResult = await evaluateUnifiedExpression(node.left, env);
  const leftValue = leftResult.value;
  
  // Short-circuit evaluation for logical operators  
  if (operator === '&&') {
    const leftTruthy = isTruthy(leftValue);
    if (!leftTruthy) {
      // Short-circuit: if left is falsy, return left value
      return leftResult;
    }
    // Otherwise evaluate and return right
    const rightResult = await evaluateUnifiedExpression(node.right, env);
    return rightResult;
  }
  
  if (operator === '||') {
    const leftTruthy = isTruthy(leftValue);
    if (leftTruthy) {
      // Short-circuit: if left is truthy, return left value
      return leftResult;
    }
    // Otherwise evaluate and return right
    const rightResult = await evaluateUnifiedExpression(node.right, env);
    return rightResult;
  }

  if (operator === '??') {
    const isNullish = leftValue === null || leftValue === undefined;
    if (!isNullish) {
      return leftResult;
    }
    return await evaluateUnifiedExpression(node.right, env);
  }
  
  const rightResult = await evaluateUnifiedExpression(node.right, env);
  const rightValue = rightResult.value;
  const mergedDescriptor = mergeEvaluatorDescriptors(leftResult, rightResult);
  
  
  switch (operator) {
    case '==':
      const equal = isEqual(leftValue, rightValue);
      return createEvaluatorResult(equal, mergedDescriptor);
    case '!=':
      return createEvaluatorResult(!isEqual(leftValue, rightValue), mergedDescriptor);
    case '~=':
      // Regex match operator
      const regex = new RegExp(String(rightValue));
      return createEvaluatorResult(regex.test(String(leftValue)), mergedDescriptor);
    case '<':
      const leftNum = toNumber(leftValue);
      const rightNum = toNumber(rightValue);
      const ltResult = leftNum < rightNum;
      return createEvaluatorResult(ltResult, mergedDescriptor);
    case '>':
      return createEvaluatorResult(toNumber(leftValue) > toNumber(rightValue), mergedDescriptor);
    case '<=':
      return createEvaluatorResult(toNumber(leftValue) <= toNumber(rightValue), mergedDescriptor);
    case '>=':
      return createEvaluatorResult(toNumber(leftValue) >= toNumber(rightValue), mergedDescriptor);
    case '+':
      return createEvaluatorResult(toNumber(leftValue) + toNumber(rightValue), mergedDescriptor);
    case '-':
      return createEvaluatorResult(toNumber(leftValue) - toNumber(rightValue), mergedDescriptor);
    case '*':
      return createEvaluatorResult(toNumber(leftValue) * toNumber(rightValue), mergedDescriptor);
    case '/':
      return createEvaluatorResult(toNumber(leftValue) / toNumber(rightValue), mergedDescriptor);
    case '%':
      return createEvaluatorResult(toNumber(leftValue) % toNumber(rightValue), mergedDescriptor);
    default:
      throw new Error(`Unknown binary operator: ${operator}`);
  }
}

/**
 * Evaluate unary expressions (!, -, +)
 */
async function evaluateUnaryExpression(
  node: any,
  env: Environment
): Promise<EvaluatorResult> {
  const operandResult = await evaluateUnifiedExpression(node.operand, env);
  const operandValue = operandResult.value;
  
  switch (node.operator) {
    case '!':
      return createEvaluatorResult(!isTruthy(operandValue), operandResult.descriptor);
    case '-':
      return createEvaluatorResult(-toNumber(operandValue), operandResult.descriptor);
    case '+':
      return createEvaluatorResult(+toNumber(operandValue), operandResult.descriptor);
    default:
      throw new Error(`Unknown unary operator: ${node.operator}`);
  }
}

/**
 * Evaluate ternary expressions (condition ? trueBranch : falseBranch)
 */
async function evaluateTernaryExpression(
  node: any,
  env: Environment
): Promise<EvaluatorResult> {
  const conditionResult = await evaluateUnifiedExpression(node.condition, env);
  const conditionValue = conditionResult.value;
  
  return isTruthy(conditionValue)
    ? await evaluateUnifiedExpression(node.trueBranch, env)
    : await evaluateUnifiedExpression(node.falseBranch, env);
}

/**
 * Evaluate array filter expressions: @array[?condition]
 */
async function evaluateArrayFilterExpression(
  node: any,
  env: Environment
): Promise<EvaluatorResult<any[]>> {
  const arrayResult = await evaluateUnifiedExpression(node.array, env);
  const array = arrayResult.value;
  
  if (!Array.isArray(array)) {
    throw new Error(`Cannot filter non-array value: ${typeof array}`);
  }
  
  const results = [];
  for (const item of array) {
    // Create new environment with current item accessible as '$'
    const itemEnv = env.withVariable('$', item);
    const passes = await evaluateUnifiedExpression(node.filter, itemEnv);
    if (passes.value) {
      results.push(item);
    }
  }
  
  return createEvaluatorResult(results, arrayResult.descriptor);
}

/**
 * Evaluate array slice expressions: @array[start:end]
 */
async function evaluateArraySliceExpression(
  node: any,
  env: Environment
): Promise<EvaluatorResult<any[]>> {
  const arrayResult = await evaluateUnifiedExpression(node.array, env);
  const array = arrayResult.value;
  
  if (!Array.isArray(array)) {
    throw new Error(`Cannot slice non-array value: ${typeof array}`);
  }
  
  const start = node.start || 0;
  const end = node.end !== undefined ? node.end : array.length;
  
  return createEvaluatorResult(array.slice(start, end), arrayResult.descriptor);
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
    if (passes.value) results.push(item);
  }
  return results;
}
