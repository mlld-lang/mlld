import type { VariableReferenceWithTailNode } from '@core/types';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';

export async function evaluateVariableReferenceWithTailNode(
  node: VariableReferenceWithTailNode,
  env: Environment
): Promise<EvalResult> {
  const { VariableReferenceEvaluator } = await import('@interpreter/eval/data-values/VariableReferenceEvaluator');
  const evaluator = new VariableReferenceEvaluator();
  const result = await evaluator.evaluate(node, env);
  return { value: result, env };
}
