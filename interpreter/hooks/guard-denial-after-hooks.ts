import { GuardError, type GuardErrorDetails } from '@core/errors/GuardError';
import type { HookableNode } from '@core/types/hooks';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { DeniedContextSnapshot, OperationContext } from '@interpreter/env/ContextManager';
import type { Environment } from '@interpreter/env/Environment';
import { runUserAfterHooks } from './user-hook-runner';

interface GuardDenialHookRunOptions {
  node: HookableNode;
  env: Environment;
  operationContext: OperationContext;
  inputs: readonly unknown[];
  error: unknown;
}

function toDeniedContext(error: GuardError, details: GuardErrorDetails): DeniedContextSnapshot {
  return {
    denied: true,
    reason: error.reason ?? details.reason ?? error.message ?? 'Guard denied operation',
    guardName: details.guardName ?? null,
    guardFilter: details.guardFilter ?? null
  };
}

function buildDenialResultValue(error: GuardError, details: GuardErrorDetails): Record<string, unknown> {
  return {
    denied: true,
    decision: 'deny',
    reason: error.reason ?? details.reason ?? error.message ?? 'Guard denied operation',
    guardName: details.guardName ?? null,
    guardFilter: details.guardFilter ?? null
  };
}

export async function runUserAfterHooksOnGuardDenial(options: GuardDenialHookRunOptions): Promise<void> {
  const { node, env, operationContext, inputs, error } = options;
  if (!(error instanceof GuardError) || error.decision !== 'deny') {
    return;
  }

  const details = (error.details ?? {}) as GuardErrorDetails;
  const deniedContext = toDeniedContext(error, details);
  const deniedResult: EvalResult = {
    value: buildDenialResultValue(error, details),
    env
  };

  await env.withDeniedContext(deniedContext, async () => {
    await runUserAfterHooks(node, deniedResult, inputs, env, operationContext);
  });
}
