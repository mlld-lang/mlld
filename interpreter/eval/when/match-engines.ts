import type { BaseMlldNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { WhenConditionPair } from '@core/types/when';
import { MlldConditionError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { createSimpleTextVariable, createObjectVariable } from '@core/types/variable';

export interface WhenMatcherRuntime {
  evaluateCondition(condition: BaseMlldNode[], env: Environment, variableName?: string): Promise<boolean>;
  evaluateActionSequence(actionNodes: BaseMlldNode[], env: Environment): Promise<EvalResult>;
  compareValues(expressionValue: unknown, conditionValue: unknown, env: Environment): Promise<boolean>;
  evaluateNode(nodes: BaseMlldNode[], env: Environment): Promise<EvalResult>;
  isExeReturnControl(value: unknown): boolean;
}

export async function evaluateFirstMatch(
  conditions: WhenConditionPair[],
  env: Environment,
  runtime: WhenMatcherRuntime,
  variableName?: string,
  expressionNodes?: BaseMlldNode[],
  blockAction?: BaseMlldNode[]
): Promise<EvalResult> {
  validateNonePlacement(conditions);

  if (blockAction && conditions.some(pair => pair.action)) {
    throw new MlldConditionError(
      'Invalid @when syntax: block action cannot combine with per-condition actions.',
      undefined,
      undefined
    );
  }

  let expressionValue: any;
  if (expressionNodes && expressionNodes.length > 0) {
    if (expressionNodes.length === 1 && expressionNodes[0].type === 'Text') {
      expressionValue = (expressionNodes[0] as any).content;
    } else if (expressionNodes.length === 1 && expressionNodes[0].type === 'VariableReference') {
      const varRef = expressionNodes[0] as any;
      const variable = env.getVariable(varRef.identifier);
      if (variable) {
        expressionValue = variable.value;
      }
    } else {
      const expressionResult = await runtime.evaluateNode(expressionNodes, env);
      expressionValue = expressionResult.value;
    }
  }

  let anyNonNoneMatched = false;

  for (const pair of conditions) {
    if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
      if (!anyNonNoneMatched) {
        const actionNodes = pair.action ?? blockAction;
        if (actionNodes) {
          return runtime.evaluateActionSequence(actionNodes, env);
        }
        return { value: '', env };
      }
      continue;
    }

    let matches = false;

    if (expressionValue !== undefined) {
      let conditionValue: any;
      let isNegated = false;
      let actualCondition = pair.condition;

      if (actualCondition.length === 1 && actualCondition[0].type === 'UnaryExpression') {
        const unaryNode = actualCondition[0] as any;
        if (unaryNode.operator === '!') {
          isNegated = true;
          actualCondition = [unaryNode.operand];
        }
      }

      if (actualCondition.length === 1 && actualCondition[0].type === 'Text') {
        conditionValue = (actualCondition[0] as any).content;
      } else if (actualCondition.length === 1 && actualCondition[0].type === 'ExecInvocation') {
        conditionValue = await runtime.evaluateCondition(actualCondition, env);
      } else {
        const conditionResult = await runtime.evaluateNode(actualCondition, env);
        conditionValue = conditionResult.value;
      }

      matches = await runtime.compareValues(expressionValue, conditionValue, env);
      if (isNegated) {
        matches = !matches;
      }
    } else {
      matches = await runtime.evaluateCondition(pair.condition, env, variableName);
    }

    if (matches) {
      anyNonNoneMatched = true;
      const actionNodes = pair.action ?? blockAction;
      if (actionNodes) {
        return runtime.evaluateActionSequence(actionNodes, env);
      }
      return { value: '', env };
    }
  }

  return { value: '', env };
}

export async function evaluateAllMatches(
  conditions: WhenConditionPair[],
  env: Environment,
  runtime: WhenMatcherRuntime,
  variableName?: string,
  blockAction?: BaseMlldNode[]
): Promise<EvalResult> {
  validateNonePlacement(conditions);

  if (blockAction) {
    if (conditions.some(pair => pair.action)) {
      throw new MlldConditionError(
        'Invalid @when syntax: \'all:\' modifier cannot have individual actions for conditions when using a block action. Use either individual actions OR a block action after the conditions: @when all: [...] => @add "action"',
        'all',
        undefined
      );
    }

    let allMatch = true;
    for (const pair of conditions) {
      if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
        continue;
      }

      const conditionResult = await runtime.evaluateCondition(pair.condition, env, variableName);
      if (!conditionResult) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      const result = await runtime.evaluateActionSequence(blockAction, env);
      return result;
    }

    return { value: '', env };
  }

  const results: string[] = [];
  let anyNonNoneMatched = false;

  for (const pair of conditions) {
    if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
      continue;
    }

    const conditionResult = await runtime.evaluateCondition(pair.condition, env, variableName);
    if (conditionResult) {
      anyNonNoneMatched = true;
      if (pair.action) {
        const actionResult = await runtime.evaluateActionSequence(pair.action, env);
        if (runtime.isExeReturnControl(actionResult.value)) {
          return actionResult;
        }
        if (actionResult.value) {
          results.push(String(actionResult.value));
        }
      }
    }
  }

  if (!anyNonNoneMatched) {
    for (const pair of conditions) {
      if (pair.condition.length === 1 && isNoneCondition(pair.condition[0])) {
        if (pair.action) {
          const actionResult = await runtime.evaluateActionSequence(pair.action, env);
          if (runtime.isExeReturnControl(actionResult.value)) {
            return actionResult;
          }
          if (actionResult.value) {
            results.push(String(actionResult.value));
          }
        }
      }
    }
  }

  return { value: results.length > 1 ? results.join('\n') : results.join(''), env };
}

export async function evaluateAnyMatch(
  conditions: WhenConditionPair[],
  env: Environment,
  runtime: WhenMatcherRuntime,
  variableName?: string,
  blockAction?: BaseMlldNode[]
): Promise<EvalResult> {
  if (conditions.some(pair => pair.action)) {
    throw new MlldConditionError(
      'Invalid @when syntax: \'any:\' modifier cannot have individual actions for conditions. Use a block action after the conditions instead: @when any: [...] => @add "action"',
      'any',
      undefined
    );
  }

  let anyMatch = false;
  for (const pair of conditions) {
    const conditionResult = await runtime.evaluateCondition(pair.condition, env, variableName);
    if (conditionResult) {
      anyMatch = true;

      if (variableName && pair.condition.length > 0) {
        const pairResult = await runtime.evaluateNode(pair.condition, env);
        const conditionValue = pairResult.value;

        const variable = typeof conditionValue === 'string'
          ? createSimpleTextVariable(variableName, conditionValue, {
              mx: {
                source: {
                  directive: 'var',
                  syntax: 'quoted',
                  hasInterpolation: false,
                  isMultiLine: false
                }
              }
            })
          : createObjectVariable(variableName, conditionValue, {
              mx: {
                source: {
                  directive: 'var',
                  syntax: 'object',
                  hasInterpolation: false,
                  isMultiLine: false
                }
              }
            });
        env.setVariable(variableName, variable);
      }

      break;
    }
  }

  if (anyMatch && blockAction) {
    return runtime.evaluateNode(blockAction, env);
  }

  return { value: '', env };
}

export function isNoneCondition(condition: any): boolean {
  return condition?.type === 'Literal' && condition?.valueType === 'none';
}

export function validateNonePlacement(conditions: any[]): void {
  let foundNone = false;
  let foundWildcard = false;

  for (const conditionEntry of conditions) {
    const condition = conditionEntry.condition?.[0] || conditionEntry;

    if (isNoneCondition(condition)) {
      foundNone = true;
    } else if (condition?.type === 'Literal' && condition?.valueType === 'wildcard') {
      foundWildcard = true;
      if (foundNone) {
        continue;
      }
    } else if (foundNone) {
      throw new Error(
        'The "none" keyword can only appear as the last condition(s) in a when block'
      );
    }

    if (foundWildcard && isNoneCondition(condition)) {
      throw new Error(
        'The "none" keyword cannot appear after "*" (wildcard) as it would never be reached'
      );
    }
  }
}
