import type { NewExpression } from '@core/types';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';

export async function evaluateNewExpressionNode(
  node: NewExpression,
  env: Environment
): Promise<EvalResult> {
  const { evaluateNewExpression } = await import('@interpreter/eval/new-expression');
  const value = await evaluateNewExpression(node, env);
  return { value, env };
}
