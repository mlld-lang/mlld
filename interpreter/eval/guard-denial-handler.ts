import { GuardError } from '@core/errors/GuardError';
import type { GuardErrorDetails } from '@core/errors/GuardError';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { WhenExpressionNode } from '@core/types/when';
import type { GuardContextSnapshot } from '../env/ContextManager';
import { normalizeWhenShowEffect } from '../utils/structured-value';
import { isVariable } from '../utils/variable-resolution';
import type { Variable } from '@core/types/variable';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { materializeDisplayValue } from '../utils/display-materialization';

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
  const materializedWarning = materializeDisplayValue(`${warning}\n`, undefined, warning);
  options.env.emitEffect('stderr', materializedWarning.text);
  if (materializedWarning.descriptor) {
    options.env.recordSecurityDescriptor(materializedWarning.descriptor);
  }
  maybeInjectGuardInputVariable(options.execEnv, guardInput ?? guardContext?.input);
  // Populate @output for after-guard denied handlers when available
  if (guardContext?.output !== undefined) {
    const existingOutput = options.execEnv.getVariable?.('output');
    if (!existingOutput && isVariable(guardContext.output as Variable)) {
      const outVar = guardContext.output as Variable;
      const clonedOutput: Variable = {
        ...outVar,
        name: 'output',
        ctx: { ...(outVar.ctx ?? {}) },
        internal: {
          ...(outVar.internal ?? {}),
          isSystem: true,
          isParameter: true
        }
      };
      options.execEnv.setParameterVariable('output', clonedOutput);
    }
  }
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
  if (value === undefined || value === null) {
    return;
  }
  const existingInput = execEnv.getVariable?.('input');
  if (existingInput) {
    return;
  }

  const variable =
    (isVariable(value as Variable) ? (value as Variable) : undefined) ??
    materializeExpressionValue(value, { name: 'input' });

  if (!variable) {
    return;
  }

  const clonedInput: Variable = {
    ...variable,
    name: 'input',
    ctx: { ...(variable.ctx ?? {}) },
    internal: {
      ...(variable.internal ?? {}),
      isSystem: true,
      isParameter: true
    }
  };

  execEnv.setParameterVariable('input', clonedInput);
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
