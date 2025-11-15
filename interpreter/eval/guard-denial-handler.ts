import { GuardError } from '@core/errors/GuardError';
import type { GuardErrorDetails } from '@core/errors/GuardError';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { WhenExpressionNode } from '@core/types/when';
import { normalizeWhenShowEffect } from '../utils/structured-value';

export async function handleExecGuardDenial(
  error: unknown,
  options: {
    execEnv: Environment;
    env: Environment;
    whenExprNode: WhenExpressionNode;
  }
): Promise<EvalResult | null> {
  if (!(error instanceof GuardError) || error.decision !== 'deny') {
    return null;
  }

  const details = (error.details ?? {}) as GuardErrorDetails;
  const reason = error.reason ?? details.reason ?? error.message ?? 'Guard denied operation';
  const deniedContext = {
    denied: true,
    reason,
    guardName: details.guardName ?? null,
    guardFilter: details.guardFilter ?? null
  };

  const { evaluateWhenExpression } = await import('./when-expression');
  const warning = formatGuardWarning(reason, deniedContext.guardFilter, deniedContext.guardName);
  options.env.emitEffect('stderr', `${warning}\n`);
  const whenResult = await options.execEnv.withDeniedContext(deniedContext, async () =>
    evaluateWhenExpression(options.whenExprNode, options.execEnv, undefined, { denyMode: true })
  );

  const normalization = normalizeWhenShowEffect(whenResult.value);
  const normalizedResult = {
    ...whenResult,
    value: normalization.hadShowEffect ? undefined : normalization.normalized
  };

  if (!normalizedResult.metadata?.deniedHandlerRan) {
    return null;
  }

  return {
    ...normalizedResult,
    stderr: warning
  };
}

export function formatGuardWarning(
  reason?: string | null,
  filter?: string | null,
  guardName?: string | null
): string {
  if (reason && reason.trim().length > 0) {
    return `[Guard Warning] ${reason}`;
  }
  const identifier = guardName ?? filter ?? 'operation';
  return `[Guard Warning] Guard for ${identifier} prevented operation due to policy violation`;
}
