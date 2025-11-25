import type { GuardDirectiveNode } from '@core/types/guard';
import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { GuardRegistry } from '../guards/GuardRegistry';

export async function evaluateGuard(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const guardNode = directive as GuardDirectiveNode;
  const registry = env.getGuardRegistry();
  registry.register(guardNode, directive.location ?? null);
  return { value: undefined, env };
}
