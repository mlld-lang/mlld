import type { Environment } from '../env/Environment';
import { evaluate, type EvaluationContext } from '../core/interpreter';
import { MlldDirectiveError } from '../../core/errors/MlldDirectiveError';
import {
  createEvaluatorResult,
  mergeEvaluatorDescriptors,
  type EvaluatorResult
} from '../utils/evaluator-result';
import { executeParallelExecInvocations } from './helpers/parallel-exec';
import { assertNoErrorLikeBooleanValue } from './truthiness-guard';
import type { Variable } from '@core/types/variable';
import {
  isTextLike,
  isArray as isArrayVariable,
  isObject as isObjectVariable,
  isCommandResult,
  isPipelineInput
} from '@core/types/variable';
import {
  asData,
  asText,
  assertStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue
} from '../utils/structured-value';
import { isShelfSlotRefValue } from '@core/types/shelf';

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
      if (str === '' || str.toLowerCase() === 'false' || str === '0' || str.toLowerCase() === 'nan') {
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

  if (isShelfSlotRefValue(value)) {
    return true;
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
    // String "NaN" is false (case insensitive)
    if (value.toLowerCase() === 'nan') {
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
  if (
    value &&
    typeof value === 'object' &&
    'type' in value &&
    'name' in value &&
    'source' in value &&
    'value' in value
  ) {
    const variable = value as Variable;
    return extractValue(variable.value);
  }
  if (isStructuredValue(value)) {
    return extractValue(value.data ?? value.text);
  }
  if (isShelfSlotRefValue(value)) {
    return extractValue(value.data ?? value.text);
  }
  if (Array.isArray(value)) {
    return value.map(item => extractValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if ((value as { type?: string }).type === 'Literal' && 'value' in value) {
    return extractValue((value as { value: unknown }).value);
  }
  if ((value as { type?: string }).type === 'Text' && 'content' in value) {
    const content = (value as { content: unknown }).content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map(part => String(extractValue(part) ?? '')).join('');
    }
  }
  if ((value as { type?: string }).type === 'array') {
    const items = ((value as { items?: unknown[]; elements?: unknown[] }).items ??
      (value as { items?: unknown[]; elements?: unknown[] }).elements ??
      []);
    return items.map(item => extractValue(item));
  }
  return value;
}

function arraysAreEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((item, index) => isEqual(item, b[index]));
}

function isNullLikeForTolerantMatch(value: unknown): boolean {
  const extracted = extractValue(value);

  if (extracted === null || extracted === undefined) {
    return true;
  }

  if (Array.isArray(extracted)) {
    return extracted.length === 0;
  }

  return typeof extracted === 'string' && extracted.trim().toLowerCase() === 'null';
}

function coerceNumericString(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function toTolerantArray(value: unknown): unknown[] | null {
  const extracted = extractValue(value);

  if (Array.isArray(extracted)) {
    return extracted.map(item => extractValue(item));
  }

  if (extracted === null || extracted === undefined) {
    return [];
  }

  if (typeof extracted === 'string') {
    const trimmed = extracted.trim();

    if (trimmed.toLowerCase() === 'null') {
      return [];
    }

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map(part => part.trim())
        .filter(part => part.length > 0);
    }

    return [trimmed];
  }

  return null;
}

function isTolerantScalarMatch(actual: unknown, expected: unknown): boolean {
  const actualValue = extractValue(actual);
  const expectedValue = extractValue(expected);

  if (actualValue === null || actualValue === undefined || expectedValue === null || expectedValue === undefined) {
    return actualValue === expectedValue;
  }

  if (typeof actualValue === 'number' && typeof expectedValue === 'string') {
    const expectedNumber = coerceNumericString(expectedValue);
    return expectedNumber !== null && actualValue === expectedNumber;
  }

  if (typeof actualValue === 'string' && typeof expectedValue === 'number') {
    const actualNumber = coerceNumericString(actualValue);
    return actualNumber !== null && actualNumber === expectedValue;
  }

  if (Array.isArray(actualValue) || Array.isArray(expectedValue)) {
    return Array.isArray(actualValue) && Array.isArray(expectedValue) && arraysAreEqual(actualValue, expectedValue);
  }

  return Object.is(actualValue, expectedValue);
}

function isTolerantArrayMatch(actualItems: readonly unknown[], expectedItems: readonly unknown[]): boolean {
  if (expectedItems.length === 0) {
    return actualItems.length === 0;
  }

  if (actualItems.length === 0) {
    return false;
  }

  const remainingExpected = [...expectedItems];

  for (const actualItem of actualItems) {
    const matchIndex = remainingExpected.findIndex(expectedItem => isTolerantScalarMatch(actualItem, expectedItem));
    if (matchIndex === -1) {
      return false;
    }
    remainingExpected.splice(matchIndex, 1);
  }

  return true;
}

/**
 * Tolerant semantic comparison for LLM-produced values.
 *
 * Differences from ==:
 * - string <-> array coercion for flat lists
 * - comma-separated string <-> array coercion
 * - order-independent array matching
 * - subset semantics for actual ~= expected array comparisons
 * - null / [] / "null" equivalence only when the expected side is empty
 */
export function isTolerantMatch(actual: unknown, expected: unknown): boolean {
  if (isNullLikeForTolerantMatch(expected)) {
    return isNullLikeForTolerantMatch(actual);
  }

  if (isNullLikeForTolerantMatch(actual)) {
    return false;
  }

  const expectedArray = toTolerantArray(expected);
  if (expectedArray) {
    const actualArray = toTolerantArray(actual);
    if (actualArray) {
      return isTolerantArrayMatch(actualArray, expectedArray);
    }

    return expectedArray.length === 1 && isTolerantScalarMatch(actual, expectedArray[0]);
  }

  const actualArray = toTolerantArray(actual);
  if (actualArray) {
    return actualArray.length === 1 && isTolerantScalarMatch(actualArray[0], expected);
  }

  return isTolerantScalarMatch(actual, expected);
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

  // Collections compare structurally so literal equality works in guards and expressions.
  if (Array.isArray(aValue) || Array.isArray(bValue)) {
    return Array.isArray(aValue) && Array.isArray(bValue) && arraysAreEqual(aValue, bValue);
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
          throw new Error('The "none" keyword can only be used as a condition in when directives');
        }
        return createEvaluatorResult(node.value);
      case 'VariableReference':
        // Delegate variable references to the standard evaluator
        try {
          const varResult = await evaluate(node, env, expressionContext);
          const valueDescriptor = extractSecurityDescriptor(varResult.value, {
            recursive: true,
            mergeArrayElements: true
          });
          if (valueDescriptor) {
            return createEvaluatorResult(varResult.value, valueDescriptor);
          }

          if (typeof node.identifier === 'string') {
            const sourceVariable = env.getVariable(node.identifier);
            const sourceDescriptor = extractSecurityDescriptor(sourceVariable, {
              recursive: true,
              mergeArrayElements: true
            });
            if (sourceDescriptor) {
              return createEvaluatorResult(varResult.value, sourceDescriptor);
            }
          }

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
    if (error instanceof MlldDirectiveError) {
      throw error;
    }
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

function normalizeBinaryOperator(operator: unknown): string {
  return Array.isArray(operator) ? operator[0] : String(operator);
}

function isParallelStreamExecInvocation(node: any): boolean {
  return node?.type === 'ExecInvocation' && node?.withClause?.stream === true;
}

function collectParallelStreamExecInvocations(node: any): any[] | null {
  if (isParallelStreamExecInvocation(node)) {
    return [node];
  }

  if (!node || node.type !== 'BinaryExpression') {
    return null;
  }

  if (normalizeBinaryOperator(node.operator) !== '||') {
    return null;
  }

  const left = collectParallelStreamExecInvocations(node.left);
  const right = collectParallelStreamExecInvocations(node.right);
  if (!left || !right) {
    return null;
  }

  return [...left, ...right];
}

/**
 * Evaluate binary expressions (&&, ||, ==, !=, ~=, !~=, <, >, <=, >=)
 */
async function evaluateBinaryExpression(
  node: any,
  env: Environment,
  context: EvaluationContext
): Promise<EvaluatorResult> {
  const operator = normalizeBinaryOperator(node.operator);

  const isConditionContext =
    Boolean(context?.isCondition) ||
    Boolean(node?.meta?.isWhenCondition) ||
    Boolean(node?.meta?.isBooleanContext);
  const parallelStreamNodes =
    operator === '||' && !isConditionContext ? collectParallelStreamExecInvocations(node) : null;
  if (parallelStreamNodes && parallelStreamNodes.length > 1) {
    const { value, descriptor } = await executeParallelExecInvocations(parallelStreamNodes, env);
    return createEvaluatorResult(value, descriptor);
  }
  
  const leftResult = await evaluateUnifiedExpression(node.left, env, context);
  const leftValue = leftResult.value;
  
  // Short-circuit evaluation for logical operators  
  if (operator === '&&') {
    assertNoErrorLikeBooleanValue(leftValue, 'Logical && evaluation');
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
    assertNoErrorLikeBooleanValue(leftValue, 'Logical || evaluation');
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
    // Shelf slot refs preserve capability identity even when the current slot
    // contents are null, so nullish coalescing should keep the ref.
    if (isShelfSlotRefValue(leftValue)) {
      return leftResult;
    }

    // Unwrap StructuredValue to check the inner data for nullish
    const rawLeft = isStructuredValue(leftValue)
      ? asData(leftValue)
      : leftValue;
    const isNullish = rawLeft === null || rawLeft === undefined;
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
      return createEvaluatorResult(isTolerantMatch(leftValue, rightValue), mergedDescriptor);
    case '!~=':
      return createEvaluatorResult(!isTolerantMatch(leftValue, rightValue), mergedDescriptor);
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
    case '+': {
      const leftNum = toNumber(leftValue);
      const rightNum = toNumber(rightValue);
      const leftRaw = extractValue(leftValue);
      const rightRaw = extractValue(rightValue);
      const hint = 'Use template interpolation such as `@first @second` instead of @first + @second.';

      if (
        Number.isNaN(leftNum) &&
        Number.isNaN(rightNum) &&
        typeof leftRaw === 'string' &&
        typeof rightRaw === 'string'
      ) {
        throw new MlldDirectiveError(
          `String concatenation with + is not supported. Use template strings instead. Hint: ${hint}`,
          'expression',
          {
            code: 'STRING_CONCAT_WITH_PLUS',
            location: node?.location,
            context: {
              hint,
              leftValuePreview: leftRaw.slice(0, 50),
              rightValuePreview: rightRaw.slice(0, 50)
            },
            env
          }
        );
      }

      return createEvaluatorResult(leftNum + rightNum, mergedDescriptor);
    }
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
      assertNoErrorLikeBooleanValue(operandValue, 'Unary ! evaluation');
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
  assertNoErrorLikeBooleanValue(conditionValue, 'Ternary condition evaluation');
  
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
