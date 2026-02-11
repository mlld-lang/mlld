import type { WhenNode } from '@core/types/when';
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { Variable } from '@core/types/variable';
import { MlldConditionError } from '@core/errors';
import { isWhenSimpleNode, isWhenBlockNode, isWhenMatchNode } from '@core/types/when';
import { evaluate } from '../core/interpreter';
import { logger } from '@core/utils/logger';
import { isExeReturnControl } from './exe-return';
import {
  isTextLike,
  isArray as isArrayVariable,
  isObject as isObjectVariable,
  isCommandResult,
  isPipelineInput
} from '@core/types/variable';
import { isStructuredValue, asData, asText, assertStructuredValue } from '../utils/structured-value';
import { evaluateLetAssignment, evaluateAugmentedAssignment } from './when/assignment-support';
import { evaluateActionSequence } from './when/action-runner';
import {
  evaluateWhenSimpleForm,
  evaluateWhenMatchForm,
  evaluateWhenBlockForm,
  type WhenFormHandlerRuntime
} from './when/form-handlers';
import { isNoneCondition, type WhenMatcherRuntime } from './when/match-engines';

const DENIED_KEYWORD = 'denied';
export { evaluateLetAssignment, evaluateAugmentedAssignment } from './when/assignment-support';

/**
 * Compares two values according to mlld's when comparison rules
 * WHY: mlld has specific comparison semantics that differ from JavaScript's ===.
 * We support string-boolean comparisons ("true" === true), null/undefined equality,
 * and truthy/falsy evaluation when comparing against boolean literals.
 * GOTCHA: String comparison is case-sensitive. "True" !== true, only "true" === true.
 * Type coercion is limited to specific cases to avoid surprising behavior.
 * CONTEXT: Used by all when directive forms (simple, switch, block) to evaluate
 * conditions consistently across the language.
 */
async function compareValues(expressionValue: any, conditionValue: any, env: Environment): Promise<boolean> {
  /**
   * Extract Variable values for equality comparison
   * WHY: Equality operations need raw values because comparisons work on
   *      primitive types, not Variable wrapper objects
   */
  const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  expressionValue = await resolveValue(expressionValue, env, ResolutionContext.Equality);
  conditionValue = await resolveValue(conditionValue, env, ResolutionContext.Equality);
  
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

function preview(value: unknown, max = 60): string {
  try {
    if (typeof value === 'string') return value.length > max ? value.slice(0, max) + '…' : value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return String(value);
    return JSON.stringify(value)?.slice(0, max) + (JSON.stringify(value)?.length! > max ? '…' : '');
  } catch {
    return String(value);
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
  const matcherRuntime: WhenMatcherRuntime = {
    evaluateCondition,
    evaluateActionSequence,
    compareValues,
    evaluateNode: evaluate,
    isExeReturnControl
  };

  const runtime: WhenFormHandlerRuntime = {
    matcherRuntime,
    evaluateLetAssignment,
    evaluateAugmentedAssignment,
    containsNoneWithOperator
  };

  if (isWhenSimpleNode(node)) {
    return evaluateWhenSimpleForm(node, env, runtime);
  } else if (isWhenMatchNode(node)) {
    return evaluateWhenMatchForm(node, env, runtime);
  } else if (isWhenBlockNode(node)) {
    return evaluateWhenBlockForm(node, env, runtime);
  }
  
  throw new MlldConditionError(
    `Unknown when node subtype: ${(node as any).subtype}`,
    undefined,
    node.location
  );
}

/**
 * Evaluates a condition expression to a boolean value
 */
export async function evaluateCondition(
  condition: BaseMlldNode[],
  env: Environment,
  variableName?: string
): Promise<boolean> {
  const deniedContext = env.getContextManager().peekDeniedContext();
  const deniedState = Boolean(deniedContext?.denied);

  // Handle new WhenCondition wrapper nodes from unified expressions
  if (condition.length === 1 && condition[0].type === 'WhenCondition') {
    const whenCondition = condition[0] as any;
    const expression = whenCondition.expression;
    
    // Evaluate the wrapped expression
    const result = await evaluateCondition([expression], env, variableName);
    
    // Apply negation if specified in the wrapper
    return whenCondition.negated ? !result : result;
  }
  
  // Check if this is a negation node (UnaryExpression with operator '!')
  if (condition.length === 1 && condition[0].type === 'UnaryExpression') {
    const unaryNode = condition[0] as any;
    if (unaryNode.operator === '!') {
      if (isDeniedLiteralNode(unaryNode.operand)) {
        return !deniedState;
      }
      const innerCondition = [unaryNode.operand];
      
      // Evaluate the inner condition and negate the result
      const innerResult = await evaluateCondition(innerCondition, env, variableName);
      return !innerResult;
    }
  }

  if (condition.length === 1 && isDeniedLiteralNode(condition[0])) {
    return deniedState;
  }
  
  // Check if this is an expression node (BinaryExpression, TernaryExpression, UnaryExpression)
  if (condition.length === 1) {
    const node = condition[0];
    if (node.type === 'BinaryExpression' || node.type === 'TernaryExpression' || node.type === 'UnaryExpression') {
      const { evaluateUnifiedExpression } = await import('./expressions');
      let resultValue: unknown;
      try {
        const expressionResult = await evaluateUnifiedExpression(node as any, env, { isCondition: true });
        resultValue = expressionResult.value;
      } catch (err) {
        // Add operator and operand previews for helpful diagnostics
        const op = (node as any).operator || (node as any).test?.type || node.type;
        const lhs = (node as any).left ?? (node as any).argument ?? (node as any).test;
        const rhs = (node as any).right ?? (node as any).consequent;
        const message = `Failed to evaluate condition expression (${op}).`;
        throw new MlldConditionError(message, undefined, node.location, {
          originalError: err as Error,
          errors: [
            {
              type: 'expression',
              count: 1,
              firstExample: {
                conditionIndex: 0,
                message: `op=${op}, left=${preview(lhs)}, right=${preview(rhs)}`
              }
            }
          ]
        } as any);
      }
      const truthy = isTruthy(resultValue);
      if (process.env.MLLD_DEBUG === 'true') {
        try {
          console.error('[evaluateCondition] expression node result:', {
            nodeType: node.type,
            result: resultValue,
            truthy
          });
        } catch {}
      }
      return truthy;
    }
  }
  
  // Check if this is an ExecInvocation node
  if (condition.length === 1 && condition[0].type === 'ExecInvocation') {
    const execNode = condition[0] as any;
    
    // Import the exec invocation evaluator
    const { evaluateExecInvocation } = await import('./exec-invocation');
    
    // Create a child environment for execution
    const childEnv = env.createChild();
    
    // If we have a comparison variable, pass it as the first implicit argument
    if (variableName) {
      const variable = env.getVariable(variableName);
      if (variable) {
        // Modify the ExecInvocation to include the comparison value as the first argument
        const modifiedExecNode = {
          ...execNode,
          commandRef: {
            ...execNode.commandRef,
            args: [
              // Insert the variable's value as the first argument
              {
                type: 'VariableReference',
                identifier: variableName,
                nodeId: 'implicit-when-arg',
                valueType: 'variable'
              },
              ...(execNode.commandRef.args || [])
            ]
          }
        };
        
    // Execute the modified invocation
    let result: any;
    try {
      result = await evaluateExecInvocation(modifiedExecNode, childEnv);
    } catch (err) {
      const name = modifiedExecNode?.commandRef?.name || 'exec';
      throw new MlldConditionError(
        `Failed to evaluate function in condition: ${name}`,
        undefined,
        (modifiedExecNode as any).location,
        { originalError: err as Error } as any
      );
    }
        
        // Check the result for truthiness
        if (result.stdout !== undefined) {
          // Command execution result
          if (result.exitCode !== undefined && result.exitCode !== 0) {
            return false;
          }
          if (result.value !== undefined && result.value !== result.stdout) {
            /**
             * Extract Variable value for truthiness evaluation
             * WHY: Truthiness checks need raw values because boolean logic operates on
             *      primitive types, not Variable metadata
             */
            const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
            const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
            return isTruthy(finalValue);
          }
          return isTruthy(result.stdout.trim());
        }
        
        /**
         * Extract Variable value for truthiness evaluation
         * WHY: Truthiness checks need raw values because boolean logic operates on
         *      primitive types, not Variable metadata
         */
        const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
        const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
        return isTruthy(finalValue);
      }
    }
    
    // No comparison variable - just execute the function and check its result
    let result: any;
    try {
      result = await evaluateExecInvocation(execNode, childEnv);
    } catch (err) {
      const name = (execNode as any)?.commandRef?.name || 'exec';
      throw new MlldConditionError(
        `Failed to evaluate function in condition: ${name}`,
        undefined,
        (execNode as any).location,
        { originalError: err as Error } as any
      );
    }
    
    // Check the result for truthiness
    if (result.stdout !== undefined) {
      // Command execution result
      if (result.exitCode !== undefined && result.exitCode !== 0) {
        return false;
      }
      if (result.value !== undefined && result.value !== result.stdout) {
        const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
        const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
        return isTruthy(finalValue);
      }
      return isTruthy(result.stdout.trim());
    }
    
    const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
    const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
    return isTruthy(finalValue);
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
    logger.debug('Evaluating condition:', { condition });
  }
  
  // Evaluate the condition with condition and expression context
  let result: any;
  try {
    result = await evaluate(condition, childEnv, { isCondition: true, isExpression: true });
  } catch (err) {
    throw new MlldConditionError(
      'Failed to evaluate condition value',
      undefined,
      (condition[0] as any)?.location,
      { originalError: err as Error } as any
    );
  }
  
  if (process.env.DEBUG_WHEN) {
    logger.debug('Condition evaluation result:', { result });
  }
  
  // If we have a variable to compare against
  if (variableName && childEnv.hasVariable('_whenValue')) {
    const whenValue = childEnv.getVariable('_whenValue');
    
    // Check if the condition is an executable (function call)
    if (result.value && typeof result.value === 'object' && result.value.type === 'executable') {
      // The executable should have already been evaluated with _whenValue as context
      // Just check its boolean result
      const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
      const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
      return isTruthy(finalValue);
    }
    
    // Get the actual value from the variable
    let actualValue: any;
    if (whenValue && typeof whenValue === 'object' && 'value' in whenValue) {
      actualValue = whenValue.value;
    } else {
      actualValue = whenValue;
    }
    
    // Compare the variable value with the condition value
    return compareValues(actualValue, result.value, childEnv);
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
      /**
       * Extract Variable value for truthiness evaluation
       * WHY: Truthiness checks need raw values because boolean logic operates on
       *      primitive types, not Variable metadata
       */
      const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
      const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
      return isTruthy(finalValue);
    }
    // Otherwise check stdout - trim whitespace
    const trimmedStdout = result.stdout.trim();
    if (process.env.DEBUG_WHEN) {
      logger.debug('Trimmed stdout for truthiness:', { trimmedStdout });
    }
    return isTruthy(trimmedStdout);
  }
  
  /**
   * Extract Variable value for truthiness evaluation
   * WHY: Truthiness checks need raw values because boolean logic operates on
   *      primitive types, not Variable metadata
   */
  const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  const finalValue = await resolveValue(result.value, childEnv, ResolutionContext.Truthiness);
  
  // Convert result to boolean
  return isTruthy(finalValue);
}

function isDeniedLiteralNode(node: BaseMlldNode | undefined): boolean {
  if (!node) {
    return false;
  }
  if (node.type === 'Literal' && typeof (node as any).value === 'string') {
    return (node as any).value.toLowerCase() === DENIED_KEYWORD;
  }
  if (node.type === 'Text' && typeof (node as any).content === 'string') {
    return (node as any).content.trim().toLowerCase() === DENIED_KEYWORD;
  }
  if (
    node.type === 'VariableReference' &&
    typeof (node as any).identifier === 'string' &&
    (node as any).identifier.toLowerCase() === DENIED_KEYWORD
  ) {
    return true;
  }
  return false;
}

function isDeniedField(field: any): boolean {
  if (!field) {
    return false;
  }
  if (typeof field.name === 'string' && field.name.toLowerCase() === DENIED_KEYWORD) {
    return true;
  }
  if (typeof field.identifier === 'string' && field.identifier.toLowerCase() === DENIED_KEYWORD) {
    return true;
  }
  return false;
}

export function conditionTargetsDenied(condition: BaseMlldNode[]): boolean {
  const visited = new Set<BaseMlldNode>();
  const stack = [...condition];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (visited.has(node)) {
      continue;
    }
    visited.add(node);

    if (isDeniedLiteralNode(node)) {
      return true;
    }

    if ((node as any).type === 'VariableReference') {
      const identifier = typeof (node as any).identifier === 'string'
        ? (node as any).identifier.toLowerCase()
        : '';
      if (identifier === DENIED_KEYWORD) {
        return true;
      }
      if (
        identifier === 'mx' &&
        Array.isArray((node as any).fields) &&
        (node as any).fields.some(isDeniedField)
      ) {
        return true;
      }
    }

    for (const value of Object.values(node as any)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            stack.push(item as BaseMlldNode);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        stack.push(value as BaseMlldNode);
      }
    }
  }

  return false;
}

/**
 * Determines if a value is truthy according to mlld rules
 * WHY: mlld has specific truthiness rules that differ from JavaScript. Empty strings,
 * empty arrays, and empty objects are falsy, while non-empty values are truthy.
 * GOTCHA: Unlike JavaScript, empty arrays [] and empty objects {} are falsy in mlld.
 * The string "false" is truthy (non-empty string), only the boolean false is falsy.
 * CONTEXT: Used in when conditions to determine if branches should execute, especially
 * important for the simple form: /when @var => /action (executes if @var is truthy).
 */
function isTruthy(value: any): boolean {
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
      assertStructuredValue(variable.value, 'when:isTruthy:pipeline-input');
      return asText(variable.value).length > 0;
    }
    
    // For other variable types, use their value
    return isTruthy(variable.value);
  }
  
  if (isStructuredValue(value)) {
    try {
      const structuredData = asData(value);
      return isTruthy(structuredData);
    } catch {
      return isTruthy(asText(value));
    }
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

/**
 * Check if a node contains 'none' wrapped in an operator expression
 */
function containsNoneWithOperator(node: any): boolean {
  if (!node) return false;
  if (node.type === 'UnaryExpression' && isNoneCondition(node.operand)) return true;
  if (node.type === 'BinaryExpression' && (isNoneCondition(node.left) || isNoneCondition(node.right))) return true;
  if (node.type === 'ComparisonExpression' && (isNoneCondition(node.left) || isNoneCondition(node.right))) return true;
  return false;
}
