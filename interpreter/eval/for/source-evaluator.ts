import type {
  Environment,
  ForDirective,
  ForExpression,
  SourceLocation
} from '@core/types';
import { MlldDirectiveError } from '@core/errors';
import type { SecurityDescriptor } from '@core/types/security';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { evaluate } from '@interpreter/core/interpreter';
import { toIterable, type ForSourceIterable } from '@interpreter/eval/for-utils';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';

function formatForSourcePreview(value: unknown): string {
  const receivedType = typeof value;
  try {
    if (receivedType === 'object') {
      return JSON.stringify(value)?.slice(0, 120) ?? '';
    }
    return String(value)?.slice(0, 120) ?? '';
  } catch {
    return String(value);
  }
}

function throwForTypeMismatchError(sourceValue: unknown, location?: SourceLocation): never {
  const receivedType = typeof sourceValue;
  const preview = formatForSourcePreview(sourceValue);
  throw new MlldDirectiveError(
    `Type mismatch: for expects an array. Received: ${receivedType}${preview ? ` (${preview})` : ''}`,
    'for',
    { location, context: { expected: 'array', receivedType } }
  );
}

function toIterableOrThrow(sourceValue: unknown, location?: SourceLocation): ForSourceIterable {
  const iterable = toIterable(sourceValue);
  if (iterable) {
    return iterable;
  }
  throwForTypeMismatchError(sourceValue, location);
}

function resolveForExpressionSourceName(expr: ForExpression): string | undefined {
  const sourceNode = Array.isArray(expr.source) ? (expr.source as any)[0] : expr.source;
  return sourceNode?.identifier ?? sourceNode?.name;
}

function resolveSourceDescriptor(
  sourceVarName: string | undefined,
  env: Environment,
  sourceValue: unknown
): SecurityDescriptor | undefined {
  let sourceDescriptor = extractSecurityDescriptor(sourceValue, {
    recursive: true,
    mergeArrayElements: true
  });
  if (sourceDescriptor) {
    return sourceDescriptor;
  }

  if (!sourceVarName) {
    return undefined;
  }

  const sourceVar = env.getVariable(sourceVarName);
  if (!sourceVar?.mx) {
    return undefined;
  }

  const varDescriptor = varMxToSecurityDescriptor(sourceVar.mx);
  if (varDescriptor.labels.length > 0 || varDescriptor.taint.length > 0) {
    sourceDescriptor = varDescriptor;
  }
  return sourceDescriptor;
}

export async function evaluateForDirectiveSource(
  directive: ForDirective,
  env: Environment
): Promise<{ iterable: ForSourceIterable; sourceDescriptor?: SecurityDescriptor }> {
  const sourceNode = Array.isArray(directive.values.source)
    ? directive.values.source[0]
    : directive.values.source;
  const sourceResult = await evaluate(sourceNode, env);
  const sourceVarName = (sourceNode as any)?.identifier ?? (sourceNode as any)?.name;
  return {
    iterable: toIterableOrThrow(sourceResult.value, directive.location),
    sourceDescriptor: resolveSourceDescriptor(sourceVarName, env, sourceResult.value)
  };
}

export async function evaluateForExpressionSource(
  expr: ForExpression,
  env: Environment
): Promise<{ iterable: ForSourceIterable; sourceDescriptor?: SecurityDescriptor }> {
  const sourceResult = await evaluate(expr.source, env, { isExpression: true });
  const sourceValue = sourceResult.value;
  const sourceVarName = resolveForExpressionSourceName(expr);
  return {
    iterable: toIterableOrThrow(sourceValue, expr.location),
    sourceDescriptor: resolveSourceDescriptor(sourceVarName, env, sourceValue)
  };
}
