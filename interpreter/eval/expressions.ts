import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError } from '../../core/errors/MlldDirectiveError';
import { isEqual, toNumber, isTruthy } from './expression';

/**
 * Unified expression evaluator for all expression types from the unified grammar
 * Handles: BinaryExpression, UnaryExpression, TernaryExpression, ArrayFilterExpression, ArraySliceExpression, Literal nodes
 */
export async function evaluateUnifiedExpression(node: any, env: Environment): Promise<any> {
  // Temporary unconditional debug to trace the issue
  console.log('[DEBUG] evaluateUnifiedExpression called with:', {
    nodeType: node?.type,
    operator: node?.operator,
    hasLeft: !!node?.left,
    hasRight: !!node?.right,
    nodeKeys: node ? Object.keys(node) : 'null/undefined'
  });

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
        return node.value;
      case 'VariableReference':
        // Delegate variable references to the standard evaluator
        try {
          // DEBUG: Log what we're about to evaluate
          console.log('🔍 EVALUATING VARIABLE REFERENCE IN EXPRESSION:', {
            identifier: node.identifier,
            hasFields: !!node.fields,
            fields: node.fields,
            nodeStructure: Object.keys(node)
          });
          const varResult = await evaluate(node, env);
          console.log('🔍 VARIABLE REFERENCE RESULT:', {
            success: true,
            value: varResult.value,
            valueType: typeof varResult.value
          });
          return varResult.value;
        } catch (error) {
          // Handle undefined variables gracefully for backward compatibility
          if (error.message && error.message.includes('Variable not found')) {
            if (process.env.MLLD_DEBUG === 'true') {
              console.log('[DEBUG] Variable not found, returning undefined:', node.identifier);
            }
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
        if (process.env.MLLD_DEBUG === 'true') {
          console.log('[DEBUG] Delegating node type to standard evaluator:', {
            nodeType: node.type,
            nodeKeys: Object.keys(node),
            node: JSON.stringify(node, null, 2)
          });
        }
        const result = await evaluate(node, env);
        return result.value;
    }
  } catch (error) {
    // DEBUG: Log what failed
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('❌ EXPRESSION EVALUATION ERROR:', {
        nodeType: node.type,
        node: JSON.stringify(node, null, 2),
        error: error.message
      });
    }
    throw new MlldDirectiveError(
      `Expression evaluation failed: ${error.message}`,
      'UnifiedExpression',
      { nodeType: node.type, operator: node.operator }
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
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('[DEBUG] evaluateBinaryExpression called with:', {
      operator: operator,
      originalOperator: node.operator,
      operatorType: typeof operator,
      leftType: node.left.type,
      rightType: node.right.type
    });
  }
  
  // DEBUG: Log what we're evaluating
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('🔬 BINARY EXPRESSION NODES:', {
      leftType: node.left?.type,
      rightType: node.right?.type,
      left: JSON.stringify(node.left, null, 2),
      right: JSON.stringify(node.right, null, 2)
    });
  }
  
  const leftResult = await evaluateUnifiedExpression(node.left, env);
  
  // Deep debug for left value to understand structure
  console.log('🔬 LEFT VALUE DEBUG:', {
    raw: leftResult,
    type: typeof leftResult,
    isNumber: typeof leftResult === 'number',
    constructor: leftResult?.constructor?.name,
    valueOf: leftResult?.valueOf?.(),
    isVariable: leftResult && typeof leftResult === 'object' && 'value' in leftResult,
    extractedValue: leftResult?.value,
    jsonStringify: JSON.stringify(leftResult)
  });
  
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
  
  // Deep debug for right value
  console.log('🔬 RIGHT VALUE DEBUG:', {
    raw: rightResult,
    type: typeof rightResult,
    isNumber: typeof rightResult === 'number',
    constructor: rightResult?.constructor?.name,
    valueOf: rightResult?.valueOf?.(),
    jsonStringify: JSON.stringify(rightResult)
  });
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('[DEBUG] About to switch on operator:', {
      operator: operator,
      originalOperator: node.operator,
      operatorStringified: JSON.stringify(operator),
      leftResult,
      rightResult
    });
  }
  
  switch (operator) {
    case '==':
      const equal = isEqual(leftResult, rightResult);
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('[DEBUG] == comparison details:', {
          left: leftResult,
          leftType: typeof leftResult,
          right: rightResult, 
          rightType: typeof rightResult,
          equal
        });
      }
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
      console.log('🔬 < COMPARISON DEBUG:', {
        leftOriginal: leftResult,
        rightOriginal: rightResult,
        leftConverted: leftNum,
        rightConverted: rightNum,
        result: ltResult,
        comparison: `${leftNum} < ${rightNum} = ${ltResult}`
      });
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