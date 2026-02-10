import type { LabelModificationNode } from '@core/types/label-modification';
import type {
  EvalResult,
  EvaluationContext
} from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';

export async function evaluateLabelModificationNode(
  node: LabelModificationNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const { evaluateLabelModification } = await import('@interpreter/eval/label-modification');
  return evaluateLabelModification(node, env, context);
}
