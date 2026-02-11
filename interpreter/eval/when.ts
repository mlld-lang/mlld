import type { WhenNode } from '@core/types/when';
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { MlldConditionError } from '@core/errors';
import { isWhenSimpleNode, isWhenBlockNode, isWhenMatchNode } from '@core/types/when';
import { evaluate } from '../core/interpreter';
import { isExeReturnControl } from './exe-return';
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
import { compareValues, isTruthy, isDeniedLiteralNode } from './when/condition-utils';

export { evaluateLetAssignment, evaluateAugmentedAssignment } from './when/assignment-support';
export { conditionTargetsDenied } from './when/condition-utils';

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
