import { isDirectiveHookTarget } from '@core/types/hooks';
import type { PostHook } from './HookManager';
import { executePostGuard } from './guard-post-orchestrator';

export const guardPostHook: PostHook = async (node, result, inputs, env, operation) => {
  if (!operation || (isDirectiveHookTarget(node) && node.kind === 'guard')) {
    return result;
  }

  if (env.shouldSuppressGuards()) {
    return result;
  }

  return env.withGuardSuppression(async () =>
    executePostGuard({
      node,
      result,
      inputs,
      env,
      operation
    })
  );
};
