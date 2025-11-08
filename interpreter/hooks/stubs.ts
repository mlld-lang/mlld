import type { HookDecision, PreHook } from './HookManager';

export const guardPreHookStub: PreHook = async (): Promise<HookDecision> => {
  return { action: 'continue' };
};
