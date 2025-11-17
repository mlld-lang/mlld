import { GuardError } from '@core/errors/GuardError';
import type { GuardErrorDetails } from '@core/errors/GuardError';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { WhenExpressionNode } from '@core/types/when';
import type { GuardContextSnapshot } from '../env/ContextManager';
import { normalizeWhenShowEffect } from '../utils/structured-value';
import { isVariable } from '../utils/variable-resolution';
import type { Variable } from '@core/types/variable';

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
  const guardContext = details.guardContext as GuardContextSnapshot | undefined;
  const guardInput = details.guardInput;
  const deniedContext = {
    denied: true,
    reason,
    guardName: details.guardName ?? null,
    guardFilter: details.guardFilter ?? null
  };

  const { evaluateWhenExpression } = await import('./when-expression');
  const warning = formatGuardWarning(reason, deniedContext.guardFilter, deniedContext.guardName);
  options.env.emitEffect('stderr', `${warning}\n`);
  maybeInjectGuardInputVariable(options.execEnv, guardInput ?? guardContext?.input);
  const runHandlers = async () =>
    options.execEnv.withDeniedContext(deniedContext, async () =>
      evaluateWhenExpression(options.whenExprNode, options.execEnv, undefined, { denyMode: true })
    );
  const whenResult = guardContext
    ? await options.execEnv.withGuardContext(guardContext, runHandlers)
    : await runHandlers();

  const normalization = normalizeWhenShowEffect(whenResult.value);
  const normalizedResult = {
    ...whenResult,
    value: normalization.hadShowEffect ? undefined : normalization.normalized
  };

  if (!normalizedResult.internal?.deniedHandlerRan) {
    return null;
  }

  return {
    ...normalizedResult,
    stderr: warning
  };
}

function maybeInjectGuardInputVariable(execEnv: Environment, value: unknown) {
  if (!value || typeof value !== 'object') {
    return;
  }
  const existingInput = execEnv.getVariable?.('input');
  if (existingInput) {
    return;
  }
  if (isVariable(value as Variable)) {
    execEnv.setVariable('input', value as Variable);
  }
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
