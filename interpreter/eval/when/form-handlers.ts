import type { BaseMlldNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { WhenSimpleNode, WhenMatchNode, WhenBlockNode } from '@core/types/when';
import { isLetAssignment, isAugmentedAssignment, isConditionPair } from '@core/types/when';
import { logger } from '@core/utils/logger';
import { MlldConditionError } from '@core/errors';
import {
  evaluateFirstMatch,
  validateNonePlacement,
  isNoneCondition,
  type WhenMatcherRuntime
} from './match-engines';

export interface WhenFormHandlerRuntime {
  matcherRuntime: WhenMatcherRuntime;
  evaluateLetAssignment(entry: any, env: Environment): Promise<Environment>;
  evaluateAugmentedAssignment(entry: any, env: Environment): Promise<Environment>;
}

export async function evaluateWhenSimpleForm(
  node: WhenSimpleNode,
  env: Environment,
  runtime: WhenFormHandlerRuntime
): Promise<EvalResult> {
  const conditionNodes = Array.isArray(node.values.condition) ? node.values.condition : [node.values.condition];
  for (const cond of conditionNodes) {
    if (containsNoneWithOperator(cond)) {
      throw new Error('The \'none\' keyword cannot be used with operators');
    }
  }

  const conditionResult = await runtime.matcherRuntime.evaluateCondition(node.values.condition, env);

  if (process.env.DEBUG_WHEN) {
    logger.debug('When condition result:', { conditionResult });
  }

  if (!conditionResult) {
    return { value: '', env };
  }

  const isBlockForm = node.meta?.isBlockForm === true;
  const actionNodes = Array.isArray(node.values.action) ? node.values.action : [node.values.action];

  if (isBlockForm) {
    let childEnv = env.createChild();
    const lastResult = await runtime.matcherRuntime.evaluateActionSequence(actionNodes, childEnv);
    childEnv = lastResult.env;
    env.mergeChild(childEnv);

    if (runtime.matcherRuntime.isExeReturnControl(lastResult.value)) {
      return { value: lastResult.value, env };
    }

    return { value: lastResult.value ?? '', env };
  }

  return runtime.matcherRuntime.evaluateActionSequence(actionNodes, env);
}

export async function evaluateWhenMatchForm(
  node: WhenMatchNode,
  env: Environment,
  runtime: WhenFormHandlerRuntime
): Promise<EvalResult> {
  validateNonePlacement(node.values.conditions);

  let expressionValue: any;
  if (node.values.expression.length === 1 && node.values.expression[0].type === 'Text') {
    expressionValue = node.values.expression[0].content;
  } else {
    const expressionResult = await runtime.matcherRuntime.evaluateNode(node.values.expression, env);
    expressionValue = expressionResult.value;
  }

  let childEnv = env.createChild();

  for (const entry of node.values.conditions) {
    if (isLetAssignment(entry)) {
      childEnv = await runtime.evaluateLetAssignment(entry, childEnv);
    } else if (isAugmentedAssignment(entry)) {
      childEnv = await runtime.evaluateAugmentedAssignment(entry, childEnv);
    }
  }

  const conditionPairs = node.values.conditions.filter(isConditionPair);
  let anyNonNoneMatched = false;

  for (const pair of conditionPairs) {
    if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
      continue;
    }

    let isNegated = false;
    let actualCondition = pair.condition;
    if (actualCondition.length === 1 && actualCondition[0].type === 'UnaryExpression') {
      const unaryNode = actualCondition[0] as any;
      if (unaryNode.operator === '!') {
        isNegated = true;
        actualCondition = [unaryNode.operand];
      }
    }

    let conditionValue: any;
    if (actualCondition.length === 1 && actualCondition[0].type === 'Text') {
      conditionValue = actualCondition[0].content;
    } else if (actualCondition.length === 1 && actualCondition[0].type === 'ExecInvocation') {
      conditionValue = await runtime.matcherRuntime.evaluateCondition(actualCondition, childEnv);
    } else {
      const conditionResult = await runtime.matcherRuntime.evaluateNode(actualCondition, childEnv);
      conditionValue = conditionResult.value;
    }

    let matches = await runtime.matcherRuntime.compareValues(expressionValue, conditionValue, childEnv);
    if (isNegated) {
      matches = !matches;
    }

    if (!matches) {
      continue;
    }

    anyNonNoneMatched = true;
    if (!pair.action) {
      continue;
    }

    const actionNodes = Array.isArray(pair.action) ? pair.action : [pair.action];
    const actionResult = await runtime.matcherRuntime.evaluateActionSequence(actionNodes, childEnv);
    childEnv = actionResult.env;
    env.mergeChild(childEnv);

    if (runtime.matcherRuntime.isExeReturnControl(actionResult.value)) {
      return { value: actionResult.value, env };
    }

    return { value: '', env };
  }

  if (!anyNonNoneMatched) {
    for (const pair of conditionPairs) {
      if (!(pair.condition.length === 1 && isNoneCondition(pair.condition[0]))) {
        continue;
      }
      if (!pair.action) {
        continue;
      }

      const actionNodes = Array.isArray(pair.action) ? pair.action : [pair.action];
      const actionResult = await runtime.matcherRuntime.evaluateActionSequence(actionNodes, childEnv);
      childEnv = actionResult.env;
      env.mergeChild(childEnv);

      if (runtime.matcherRuntime.isExeReturnControl(actionResult.value)) {
        return { value: actionResult.value, env };
      }

      return { value: '', env };
    }
  }

  return { value: '', env };
}

export async function evaluateWhenBlockForm(
  node: WhenBlockNode,
  env: Environment,
  runtime: WhenFormHandlerRuntime
): Promise<EvalResult> {
  const modifier = node.meta?.modifier;
  if (modifier && modifier !== 'default') {
    if (modifier === 'all') {
      throw new MlldConditionError(
        'The \'all\' modifier has been removed. Use the && operator instead.\n' +
        'Example: when (@cond1 && @cond2) => action',
        'all',
        node.location
      );
    }
    if (modifier === 'any') {
      throw new MlldConditionError(
        'The \'any\' modifier has been removed. Use the || operator instead.\n' +
        'Example: when (@cond1 || @cond2) => action',
        'any',
        node.location
      );
    }
    throw new MlldConditionError(`Invalid when modifier: ${modifier}`, undefined, node.location);
  }

  let expressionNodes: BaseMlldNode[] | undefined;
  let variableName: string | undefined;

  if (node.values.variable && node.meta.hasVariable) {
    expressionNodes = node.values.variable;
    if (expressionNodes.length === 1 && expressionNodes[0].type === 'VariableReference') {
      variableName = (expressionNodes[0] as any).identifier;
    }
  }

  let childEnv = env.createChild();
  for (const entry of node.values.conditions) {
    if (isLetAssignment(entry)) {
      childEnv = await runtime.evaluateLetAssignment(entry, childEnv);
    } else if (isAugmentedAssignment(entry)) {
      childEnv = await runtime.evaluateAugmentedAssignment(entry, childEnv);
    }
  }

  const conditions = node.values.conditions.filter(isConditionPair);
  const result = await evaluateFirstMatch(
    conditions,
    childEnv,
    runtime.matcherRuntime,
    variableName,
    expressionNodes,
    node.values.action
  );

  if (process.env.DEBUG_WHEN) {
    logger.debug('Before merge:', {
      parentNodes: env.nodes.length,
      childNodes: childEnv.nodes.length,
      childInitialCount: childEnv.initialNodeCount,
      resultEnvNodes: result.env.nodes.length
    });
  }

  env.mergeChild(result.env);

  if (process.env.DEBUG_WHEN) {
    logger.debug('After merge:', {
      parentEnvNodes: env.nodes.length,
      resultValue: result.value
    });
  }

  return { value: result.value, env };
}

function containsNoneWithOperator(node: any): boolean {
  if (!node) return false;
  if (node.type === 'UnaryExpression' && isNoneCondition(node.operand)) return true;
  if (node.type === 'BinaryExpression' && (isNoneCondition(node.left) || isNoneCondition(node.right))) return true;
  if (node.type === 'ComparisonExpression' && (isNoneCondition(node.left) || isNoneCondition(node.right))) return true;
  return false;
}
