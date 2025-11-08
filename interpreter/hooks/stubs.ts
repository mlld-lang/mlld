import type { EvalResult } from '../core/interpreter';
import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import type { HookDecision, PostHook, PreHook } from './HookManager';

export const guardPreHookStub: PreHook = async (): Promise<HookDecision> => {
  return { action: 'continue' };
};

export const taintPostHookStub: PostHook = async (
  _directive: DirectiveNode,
  result: EvalResult,
  _inputs: readonly unknown[],
  _env: Environment,
  _operation?: OperationContext
): Promise<EvalResult> => {
  return result;
};
