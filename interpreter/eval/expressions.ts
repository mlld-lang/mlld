import type { Environment } from '../env/Environment';
import { evaluate, type EvaluationContext } from '../core/interpreter';
import { MlldDirectiveError } from '../../core/errors/MlldDirectiveError';
import {
  createEvaluatorResult,
  mergeEvaluatorDescriptors,
  type EvaluatorResult
} from '../utils/evaluator-result';
import { executeParallelExecInvocations } from './helpers/parallel-exec';
import type { Variable } from '@core/types/variable';
import {
  isTextLike,
  isArray as isArrayVariable,
  isObject as isObjectVariable,
  isCommandResult,
  isPipelineInput
} from '@core/types/variable';
import { asText, assertStructuredValue, isStructuredValue } from '../utils/structured-value';

/**
 * Determines if a value is truthy according to mlld rules
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

  // Handle StructuredValue types (e.g., from method calls like .includes())
  if (isStructuredValue(value)) {
    // For boolean StructuredValues, use the actual data value
    if (value.type === 'boolean') {
      return value.data === true;
    }
    // For other StructuredValues, check their text representation
    return isTruthy(value.data);
  }

  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  // Default to JavaScript truthiness
  return !!value;
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

/**
 * Unified expression evaluator for all expression types from the unified grammar
 * Handles: BinaryExpression, UnaryExpression, TernaryExpression, ArrayFilterExpression, ArraySliceExpression, Literal nodes
 */
export async function evaluateUnifiedExpression(
  node: any,
  env: Environment,
  context: EvaluationContext = {}
): Promise<EvaluatorResult> {
  const expressionContext: EvaluationContext =
    context.isExpression ? context : { ...context, isExpression: true };
  try {
    switch (node.type) {
      case 'BinaryExpression':
        return await evaluateBinaryExpression(node, env, expressionContext);
      case 'UnaryExpression':
        return await evaluateUnaryExpression(node, env, expressionContext);
      case 'TernaryExpression':
        return await evaluateTernaryExpression(node, env, expressionContext);
      case 'ArrayFilterExpression':
        return await evaluateArrayFilterExpression(node, env, expressionContext);
      case 'ArraySliceExpression':
        return await evaluateArraySliceExpression(node, env, expressionContext);
      case 'Literal':
        // Handle none literal (only valid in when context)
        if (node.valueType === 'none') {
          throw new Error('The "none" keyword can only be used as a condition in /when directives');
        }
        return createEvaluatorResult(node.value);
      case 'VariableReference':
        // Delegate variable references to the standard evaluator
        try {
          const varResult = await evaluate(node, env, expressionContext);
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
        const execResult = await evaluate(node, env, expressionContext);
        return createEvaluatorResult(execResult.value);
      case 'Text':
        // Handle text nodes that might appear in expressions
        return createEvaluatorResult(node.content);
      case 'NewExpression': {
        const { evaluateNewExpression } = await import('./new-expression');
        const value = await evaluateNewExpression(node, env);
        return createEvaluatorResult(value);
      }
      default:
        // For all other node types, delegate to the standard evaluator
        const result = await evaluate(node, env, expressionContext);
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
  env: Environment,
  context: EvaluationContext
): Promise<EvaluatorResult> {
  let { operator } = node;
  
  // Handle operator being an array (from PEG.js negative lookahead)
  if (Array.isArray(operator)) {
    operator = operator[0];
  }
  
  const isConditionContext =
    Boolean(context?.isCondition) ||
    Boolean(node?.meta?.isWhenCondition) ||
    Boolean(node?.meta?.isBooleanContext);
  const isExecParallel =
    operator === '||' &&
    !isConditionContext &&
    node.left?.type === 'ExecInvocation' &&
    node.right?.type === 'ExecInvocation';
  if (isExecParallel) {
    const { value, descriptor } = await executeParallelExecInvocations(node.left, node.right, env);
    return createEvaluatorResult(value, descriptor);
  }
  
  const leftResult = await evaluateUnifiedExpression(node.left, env, context);
  const leftValue = leftResult.value;
  
  // Short-circuit evaluation for logical operators  
  if (operator === '&&') {
    const leftTruthy = isTruthy(leftValue);
    if (!leftTruthy) {
      // Short-circuit: if left is falsy, return left value
      return leftResult;
    }
    // Otherwise evaluate and return right
    const rightResult = await evaluateUnifiedExpression(node.right, env, context);
    return rightResult;
  }
  
  if (operator === '||') {
    const leftTruthy = isTruthy(leftValue);
    if (leftTruthy) {
      // Short-circuit: if left is truthy, return left value
      return leftResult;
    }
    // Otherwise evaluate and return right
    const rightResult = await evaluateUnifiedExpression(node.right, env, context);
    return rightResult;
  }

  if (operator === '??') {
    const isNullish = leftValue === null || leftValue === undefined;
    if (!isNullish) {
      return leftResult;
    }
    return await evaluateUnifiedExpression(node.right, env, context);
  }
  
  const rightResult = await evaluateUnifiedExpression(node.right, env, context);
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
  env: Environment,
  context: EvaluationContext
): Promise<EvaluatorResult> {
  const operandResult = await evaluateUnifiedExpression(node.operand, env, context);
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
  env: Environment,
  context: EvaluationContext
): Promise<EvaluatorResult> {
  // Pass isCondition: true so missing field access returns undefined instead of throwing
  const conditionResult = await evaluateUnifiedExpression(node.condition, env, { ...context, isCondition: true });
  const conditionValue = conditionResult.value;
  
  return isTruthy(conditionValue)
    ? await evaluateUnifiedExpression(node.trueBranch, env, context)
    : await evaluateUnifiedExpression(node.falseBranch, env, context);
}

/**
 * Evaluate array filter expressions: @array[?condition]
 */
async function evaluateArrayFilterExpression(
  node: any,
  env: Environment,
  context: EvaluationContext
): Promise<EvaluatorResult<any[]>> {
  const arrayResult = await evaluateUnifiedExpression(node.array, env, context);
  const array = arrayResult.value;
  
  if (!Array.isArray(array)) {
    throw new Error(`Cannot filter non-array value: ${typeof array}`);
  }
  
  const results = [];
  for (const item of array) {
    // Create new environment with current item accessible as '$'
    const itemEnv = env.withVariable('$', item);
    const passes = await evaluateUnifiedExpression(node.filter, itemEnv, context);
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
  env: Environment,
  context: EvaluationContext
): Promise<EvaluatorResult<any[]>> {
  const arrayResult = await evaluateUnifiedExpression(node.array, env, context);
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
    'Literal',
    'NewExpression'
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
