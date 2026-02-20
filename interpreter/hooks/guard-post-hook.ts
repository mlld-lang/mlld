import { isDirectiveHookTarget } from '@core/types/hooks';
import type { PostHook } from './HookManager';
import { executePostGuard } from './guard-post-orchestrator';

function isCheckpointHit(operation?: { metadata?: unknown }): boolean {
  if (!operation || !operation.metadata || typeof operation.metadata !== 'object') {
    return false;
  }
  const metadata = operation.metadata as Record<string, unknown>;
  if (metadata.checkpointHit === true) {
    return true;
  }
  const checkpoint = metadata.checkpoint;
  if (checkpoint && typeof checkpoint === 'object') {
    return (checkpoint as Record<string, unknown>).hit === true;
  }
  return false;
}

export const guardPostHook: PostHook = async (node, result, inputs, env, operation) => {
  if (!operation || (isDirectiveHookTarget(node) && node.kind === 'guard')) {
    return result;
  }

  if (env.shouldSuppressGuards()) {
    return result;
  }

  if (isCheckpointHit(operation)) {
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
