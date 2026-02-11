import type { WhenNode } from '@core/types/when';
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { Variable } from '@core/types/variable';
import { MlldConditionError } from '@core/errors';
import { isWhenSimpleNode, isWhenBlockNode, isWhenMatchNode } from '@core/types/when';
import { evaluate } from '../core/interpreter';
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
import {
  evaluateCondition as evaluateConditionRuntime,
  type WhenConditionRuntime
} from './when/condition-evaluator';

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
  const runtime: WhenConditionRuntime = {
    evaluateNode: evaluate,
    isDeniedLiteralNode,
    compareValues,
    isTruthy,
    preview
  };
  return evaluateConditionRuntime(condition, env, runtime, variableName);
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
