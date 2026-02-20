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
import type { WhenMatcherRuntime } from './when/match-engines';
import {
  evaluateCondition as evaluateConditionRuntime,
  type WhenConditionRuntime
} from './when/condition-evaluator';
import { compareValues, isTruthy, isDeniedLiteralNode } from './when/condition-utils';

export { evaluateLetAssignment, evaluateAugmentedAssignment } from './when/assignment-support';
export { conditionTargetsDenied } from './when/condition-utils';

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
    evaluateAugmentedAssignment
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
    isTruthy
  };
  return evaluateConditionRuntime(condition, env, runtime, variableName);
}
