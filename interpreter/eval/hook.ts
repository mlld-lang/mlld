import type { HookDirectiveNode } from '@core/types/hook';
import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';

export async function evaluateHook(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const hookNode = directive as HookDirectiveNode;
  const registry = env.getHookRegistry();
  registry.register(hookNode, directive.location ?? null);
  return { value: undefined, env };
}
