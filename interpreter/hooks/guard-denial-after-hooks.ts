import { GuardError, type GuardErrorDetails } from '@core/errors/GuardError';
import type { HookableNode } from '@core/types/hooks';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { DeniedContextSnapshot, GuardContextSnapshot, OperationContext } from '@interpreter/env/ContextManager';
import type { Environment } from '@interpreter/env/Environment';
import { runUserAfterHooks } from './user-hook-runner';

interface GuardDenialHookRunOptions {
  node: HookableNode;
  env: Environment;
  operationContext: OperationContext;
  inputs: readonly unknown[];
  error: unknown;
}

function toGuardContext(details: GuardErrorDetails): GuardContextSnapshot | undefined {
  if (details.guardContext && typeof details.guardContext === 'object') {
    return details.guardContext as GuardContextSnapshot;
  }
  return undefined;
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
  const guardContext = toGuardContext(details);
  const deniedResult: EvalResult = {
    value: buildDenialResultValue(error, details),
    env
  };

  const runHooks = async () => {
    await runUserAfterHooks(node, deniedResult, inputs, env, operationContext);
  };

  if (guardContext) {
    await env.withGuardContext(guardContext, async () =>
      env.withDeniedContext(deniedContext, runHooks)
    );
    return;
  }

  await env.withDeniedContext(deniedContext, runHooks);
}
