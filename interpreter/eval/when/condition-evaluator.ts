import type { BaseMlldNode } from '@core/types';
import { normalizeWhenCondition } from '@core/types/when';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import { logger } from '@core/utils/logger';
import { MlldConditionError } from '@core/errors';
import { assertNoErrorLikeBooleanValue } from '../truthiness-guard';

export interface WhenConditionRuntime {
  evaluateNode(
    nodes: BaseMlldNode[],
    env: Environment,
    options?: { isCondition?: boolean; isExpression?: boolean }
  ): Promise<EvalResult>;
  isDeniedLiteralNode(node: BaseMlldNode | undefined): boolean;
  compareValues(expressionValue: unknown, conditionValue: unknown, env: Environment): Promise<boolean>;
  isTruthy(value: unknown): boolean;
}

export async function evaluateCondition(
  condition: BaseMlldNode[],
  env: Environment,
  runtime: WhenConditionRuntime,
  variableName?: string
): Promise<boolean> {
  condition = normalizeWhenCondition(condition);
  const deniedContext = env.getContextManager().peekDeniedContext();
  const deniedState = Boolean(deniedContext?.denied);

  if (condition.length === 1 && condition[0].type === 'WhenCondition') {
    const whenCondition = condition[0] as any;
    const expression = whenCondition.expression;
    const result = await evaluateCondition([expression], env, runtime, variableName);
    return whenCondition.negated ? !result : result;
  }

  if (condition.length === 1 && condition[0].type === 'UnaryExpression') {
    const unaryNode = condition[0] as any;
    if (unaryNode.operator === '!') {
      if (runtime.isDeniedLiteralNode(unaryNode.operand)) {
        return !deniedState;
      }

      const innerResult = await evaluateCondition([unaryNode.operand], env, runtime, variableName);
      return !innerResult;
    }
  }

  if (condition.length === 1 && runtime.isDeniedLiteralNode(condition[0])) {
    return deniedState;
  }

  if (condition.length === 1) {
    const node = condition[0];
    if (node.type === 'BinaryExpression' || node.type === 'TernaryExpression' || node.type === 'UnaryExpression') {
      return evaluateUnifiedExpressionCondition(node, env, runtime);
    }
  }

  if (condition.length === 1 && condition[0].type === 'ExecInvocation') {
    return evaluateExecInvocationCondition(condition[0] as any, env, runtime, variableName);
  }

  return evaluateGenericConditionPath(condition, env, runtime, variableName);
}

function safeTruthy(
  value: unknown,
  runtime: WhenConditionRuntime,
  options?: { location?: BaseMlldNode['location']; context?: string }
): boolean {
  try {
    assertNoErrorLikeBooleanValue(value, options?.context ?? 'Condition evaluation');
  } catch (error) {
    throw new MlldConditionError(
      error instanceof Error ? error.message : String(error),
      undefined,
      options?.location,
      { originalError: error as Error } as any
    );
  }

  return runtime.isTruthy(value);
}

async function evaluateUnifiedExpressionCondition(
  node: BaseMlldNode,
  env: Environment,
  runtime: WhenConditionRuntime
): Promise<boolean> {
  const { evaluateUnifiedExpression } = await import('../expressions');
  let resultValue: unknown;

  try {
    const expressionResult = await evaluateUnifiedExpression(node as any, env, { isCondition: true });
    resultValue = expressionResult.value;
  } catch (err) {
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

  const truthy = safeTruthy(resultValue, runtime, {
    location: node.location,
    context: 'Condition evaluation'
  });
  return truthy;
}

async function evaluateExecInvocationCondition(
  execNode: any,
  env: Environment,
  runtime: WhenConditionRuntime,
  variableName?: string
): Promise<boolean> {
  const childEnv = env.createChild();

  if (variableName) {
    const variable = env.getVariable(variableName);
    if (variable) {
      const modifiedExecNode = {
        ...execNode,
        commandRef: {
          ...execNode.commandRef,
          args: [
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

      const result = await invokeExecCondition(modifiedExecNode, childEnv);
      return evaluateExecResultTruthiness(result, childEnv, runtime);
    }
  }

  const result = await invokeExecCondition(execNode, childEnv);
  return evaluateExecResultTruthiness(result, childEnv, runtime);
}

async function evaluateGenericConditionPath(
  condition: BaseMlldNode[],
  env: Environment,
  runtime: WhenConditionRuntime,
  variableName?: string
): Promise<boolean> {
  const childEnv = env.createChild();

  if (variableName) {
    const variable = env.getVariable(variableName);
    if (variable) {
      childEnv.setVariable('_whenValue', variable);
    }
  }

  let result: any;
  try {
    result = await runtime.evaluateNode(condition, childEnv, { isCondition: true, isExpression: true });
  } catch (err) {
    throw new MlldConditionError(
      'Failed to evaluate condition value',
      undefined,
      (condition[0] as any)?.location,
      { originalError: err as Error } as any
    );
  }

  if (variableName && childEnv.hasVariable('_whenValue')) {
    const whenValue = childEnv.getVariable('_whenValue');

    if (result.value && typeof result.value === 'object' && result.value.type === 'executable') {
      const finalValue = await resolveTruthinessValue(result.value, childEnv);
      return safeTruthy(finalValue, runtime, {
        location: (condition[0] as any)?.location,
        context: 'Condition evaluation'
      });
    }

    const actualValue =
      whenValue && typeof whenValue === 'object' && 'value' in whenValue ? (whenValue as any).value : whenValue;
    return runtime.compareValues(actualValue, result.value, childEnv);
  }

  if (result.stdout !== undefined) {
    return evaluateExecResultTruthiness(result, childEnv, runtime);
  }

  const finalValue = await resolveTruthinessValue(result.value, childEnv);
  return safeTruthy(finalValue, runtime, {
    location: (condition[0] as any)?.location,
    context: 'Condition evaluation'
  });
}

async function invokeExecCondition(execNode: any, env: Environment): Promise<any> {
  const { evaluateExecInvocation } = await import('../exec-invocation');

  try {
    return await evaluateExecInvocation(execNode, env);
  } catch (err) {
    const name = execNode?.commandRef?.name || 'exec';
    throw new MlldConditionError(
      `Failed to evaluate function in condition: ${name}`,
      undefined,
      execNode?.location,
      { originalError: err as Error } as any
    );
  }
}

async function evaluateExecResultTruthiness(
  result: any,
  env: Environment,
  runtime: WhenConditionRuntime
): Promise<boolean> {
  if (result.stdout !== undefined) {
    if (result.exitCode !== undefined && result.exitCode !== 0) {
      return false;
    }

    if (result.value !== undefined && result.value !== result.stdout) {
      const finalValue = await resolveTruthinessValue(result.value, env);
      return safeTruthy(finalValue, runtime, {
        context: 'Condition evaluation'
      });
    }

    return safeTruthy(result.stdout.trim(), runtime, {
      context: 'Condition evaluation'
    });
  }

  const finalValue = await resolveTruthinessValue(result.value, env);
  return safeTruthy(finalValue, runtime, {
    context: 'Condition evaluation'
  });
}

async function resolveTruthinessValue(value: unknown, env: Environment): Promise<unknown> {
  const { resolveValue, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
  return resolveValue(value, env, ResolutionContext.Truthiness);
}

function preview(value: unknown, max = 60): string {
  try {
    if (typeof value === 'string') return value.length > max ? value.slice(0, max) + '…' : value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return String(value);
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return String(value);
    }
    return serialized.length > max ? `${serialized.slice(0, max)}…` : serialized;
  } catch {
    return String(value);
  }
}
