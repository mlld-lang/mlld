import type { PreHook } from './HookManager';

/**
 * Phase 6A inert checkpoint hook:
 * wired into built-in hook order without changing execution behavior yet.
 */
export const checkpointPreHook: PreHook = async () => ({
  action: 'continue'
});
