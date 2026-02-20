import type { Environment } from '../env/Environment';
import type { MlldNode } from '@core/types';
import { isTruthy } from './expressions';

export async function evaluateConditionalInclusion(
  conditionNode: MlldNode,
  env: Environment,
  options?: { valueNode?: unknown }
): Promise<{ shouldInclude: boolean; value: unknown }> {
  const { evaluate } = await import('../core/interpreter');
  const result = await evaluate(conditionNode, env, { isExpression: true, isCondition: true });
  const shouldInclude = isTruthy(result.value);

  if (!shouldInclude) {
    return { shouldInclude, value: result.value };
  }

  if (options?.valueNode) {
    const { evaluateDataValue } = await import('./data-value-evaluator');
    const value = await evaluateDataValue(options.valueNode as any, env);
    return { shouldInclude, value };
  }

  return { shouldInclude, value: result.value };
}
