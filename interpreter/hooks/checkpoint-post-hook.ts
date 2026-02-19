import type { PostHook } from './HookManager';

/**
 * Phase 6A inert checkpoint hook:
 * post path remains passthrough until cache-hit short-circuit activation.
 */
export const checkpointPostHook: PostHook = async (_node, result) => result;
