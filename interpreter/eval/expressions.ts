import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError } from '../../core/errors/MlldDirectiveError';

/**
 * Unified expression evaluator for all expression types from the unified grammar
 * Handles: BinaryExpression, UnaryExpression, TernaryExpression, Literal nodes
 */
export async function evaluateUnifiedExpression(node: any, env: Environment): Promise<any> {
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('[DEBUG] evaluateUnifiedExpression called with:', {
      nodeType: node.type,
      operator: node.operator,
      hasLeft: !!node.left,
      hasRight: !!node.right
    });
  }

  try {
    switch (node.type) {
      case 'BinaryExpression':
        return await evaluateBinaryExpression(node, env);
      case 'UnaryExpression':
        return await evaluateUnaryExpression(node, env);
      case 'TernaryExpression':
        return await evaluateTernaryExpression(node, env);
      case 'Literal':
        return node.value;
      case 'VariableReference':
        // Delegate variable references to the standard evaluator
        const varResult = await evaluate(node, env);
        return varResult.value;
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
          console.log('[DEBUG] Delegating node type to standard evaluator:', node.type);
        }
        const result = await evaluate(node, env);
        return result.value;
    }
  } catch (error) {
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
  const leftResult = await evaluateUnifiedExpression(node.left, env);
  
  // Short-circuit evaluation for logical operators
  if (node.operator === '&&' && !leftResult) return leftResult;
  if (node.operator === '||' && leftResult) return leftResult;
  
  const rightResult = await evaluateUnifiedExpression(node.right, env);
  
  switch (node.operator) {
    case '&&':
      return leftResult && rightResult;
    case '||':
      return leftResult || rightResult;
    case '==':
      return leftResult == rightResult;
    case '!=':
      return leftResult != rightResult;
    case '~=':
      // Regex match operator
      const regex = new RegExp(String(rightResult));
      return regex.test(String(leftResult));
    case '<':
      return leftResult < rightResult;
    case '>':
      return leftResult > rightResult;
    case '<=':
      return leftResult <= rightResult;
    case '>=':
      return leftResult >= rightResult;
    default:
      throw new Error(`Unknown binary operator: ${node.operator}`);
  }
}

/**
 * Evaluate unary expressions (!, -, +)
 */
async function evaluateUnaryExpression(node: any, env: Environment): Promise<any> {
  const operandResult = await evaluateUnifiedExpression(node.operand, env);
  
  switch (node.operator) {
    case '!':
      return !operandResult;
    case '-':
      return -Number(operandResult);
    case '+':
      return +Number(operandResult);
    default:
      throw new Error(`Unknown unary operator: ${node.operator}`);
  }
}

/**
 * Evaluate ternary expressions (condition ? trueBranch : falseBranch)
 */
async function evaluateTernaryExpression(node: any, env: Environment): Promise<any> {
  const conditionResult = await evaluateUnifiedExpression(node.condition, env);
  
  return conditionResult 
    ? await evaluateUnifiedExpression(node.trueBranch, env)
    : await evaluateUnifiedExpression(node.falseBranch, env);
}

/**
 * Check if a node is a unified expression type
 */
export function isUnifiedExpressionNode(node: any): boolean {
  return node && [
    'BinaryExpression',
    'UnaryExpression', 
    'TernaryExpression',
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