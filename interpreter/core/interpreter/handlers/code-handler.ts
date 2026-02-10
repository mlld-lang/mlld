import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';

interface CodeNodeLike {
  type: 'code';
}

export async function evaluateCodeNode(
  node: CodeNodeLike,
  env: Environment
): Promise<EvalResult> {
  const { evaluateCodeExecution } = await import('@interpreter/eval/code-execution');
  const result = await evaluateCodeExecution(node as any, env);
  return { value: result.value, env };
}
