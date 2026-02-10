import type { EvalResult, EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';

export async function evaluateWhenExpressionNode(
  node: any,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
  return evaluateWhenExpression(node, env, context);
}

export async function evaluateExeBlockNode(
  node: any,
  env: Environment
): Promise<EvalResult> {
  const { evaluateExeBlock } = await import('@interpreter/eval/exe');
  return evaluateExeBlock(node, env, {}, { scope: 'block' });
}

export async function evaluateForeachNode(
  node: any,
  env: Environment
): Promise<EvalResult> {
  const { evaluateForeachCommand } = await import('@interpreter/eval/foreach');
  const result = await evaluateForeachCommand(node, env);
  return { value: result, env };
}

export async function evaluateForExpressionNode(
  node: any,
  env: Environment
): Promise<EvalResult> {
  const { evaluateForExpression } = await import('@interpreter/eval/for');
  const result = await evaluateForExpression(node, env);
  return { value: result, env };
}

export async function evaluateLoopExpressionNode(
  node: any,
  env: Environment
): Promise<EvalResult> {
  const { evaluateLoopExpression } = await import('@interpreter/eval/loop');
  const result = await evaluateLoopExpression(node, env);
  return { value: result, env };
}
