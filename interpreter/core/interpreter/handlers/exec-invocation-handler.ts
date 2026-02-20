import type { ExecInvocation } from '@core/types';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';

export async function evaluateExecInvocationNode(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
  return evaluateExecInvocation(node, env);
}
