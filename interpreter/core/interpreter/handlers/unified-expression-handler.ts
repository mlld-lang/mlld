import type {
  BinaryExpression,
  TernaryExpression,
  UnaryExpression
} from '@core/types';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { wrapEvalValue } from './shared-utils';

type UnifiedExpressionNode = BinaryExpression | TernaryExpression | UnaryExpression;

export async function evaluateUnifiedExpressionNode(
  node: UnifiedExpressionNode,
  env: Environment
): Promise<EvalResult> {
  const { evaluateUnifiedExpression } = await import('@interpreter/eval/expressions');
  const result = await evaluateUnifiedExpression(node, env);
  return wrapEvalValue(result.value, env);
}
