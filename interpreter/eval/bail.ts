import type { DirectiveNode, SourceLocation } from '@core/types';
import { MlldBailError } from '@core/errors';
import type { EvalResult } from '@interpreter/core/interpreter';
import { evaluate } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { asData, asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';

const DEFAULT_BAIL_MESSAGE = 'Script terminated by bail directive.';

function toSourceLocation(location: any): SourceLocation | undefined {
  if (!location || !location.start) {
    return undefined;
  }

  return {
    line: location.start.line,
    column: location.start.column,
    offset: location.start.offset
  };
}

function stringifyBailMessage(value: unknown): string {
  if (value === null || typeof value === 'undefined') {
    return DEFAULT_BAIL_MESSAGE;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : DEFAULT_BAIL_MESSAGE;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

async function resolveBailMessage(
  messageNodes: unknown[] | undefined,
  env: Environment
): Promise<string> {
  if (!Array.isArray(messageNodes) || messageNodes.length === 0) {
    return DEFAULT_BAIL_MESSAGE;
  }

  const target = messageNodes.length === 1 ? messageNodes[0] : messageNodes;
  const result = await evaluate(target as any, env, { isExpression: true });
  let resolvedValue = result.value;

  if (isVariable(resolvedValue)) {
    resolvedValue = await extractVariableValue(resolvedValue, env);
  }

  if (isStructuredValue(resolvedValue)) {
    try {
      resolvedValue = asData(resolvedValue);
    } catch {
      resolvedValue = asText(resolvedValue);
    }
  }

  return stringifyBailMessage(resolvedValue);
}

export async function evaluateBail(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const message = await resolveBailMessage((directive.values as any)?.message, env);
  throw new MlldBailError(message, toSourceLocation(directive.location));
}

