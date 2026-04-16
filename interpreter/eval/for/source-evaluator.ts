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
import { extractDescriptorsFromDataAst } from '@interpreter/eval/var/security-descriptor';
import { toIterable, type ForSourceIterable } from '@interpreter/eval/for-utils';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';

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

function isAstIterableNode(value: unknown): value is {
  type: 'array' | 'object';
  items?: unknown[];
  elements?: unknown[];
  entries?: unknown[];
  properties?: unknown;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    type?: unknown;
    items?: unknown[];
    elements?: unknown[];
    entries?: unknown[];
    properties?: unknown;
  };

  if (
    candidate.type === 'array' &&
    (Array.isArray(candidate.items) || Array.isArray(candidate.elements))
  ) {
    return true;
  }

  return (
    candidate.type === 'object' &&
    (Array.isArray(candidate.entries) || !!candidate.properties)
  );
}

async function materializeForSourceValue(
  sourceValue: unknown,
  env: Environment
): Promise<unknown> {
  if (isVariable(sourceValue)) {
    return extractVariableValue(sourceValue, env);
  }

  if (!isAstIterableNode(sourceValue)) {
    return sourceValue;
  }

  const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
  return evaluateDataValue(sourceValue as any, env);
}

function resolveSourceDescriptor(
  sourceVarName: string | undefined,
  env: Environment,
  sourceValue: unknown,
  sourceNode?: unknown
): SecurityDescriptor | undefined {
  let sourceDescriptor = extractSecurityDescriptor(sourceValue, {
    recursive: true,
    mergeArrayElements: true
  });
  if (sourceDescriptor) {
    return sourceDescriptor;
  }

  if (sourceVarName) {
    const sourceVar = env.getVariable(sourceVarName);
    if (sourceVar?.mx) {
      const varDescriptor = varMxToSecurityDescriptor(sourceVar.mx);
      if (varDescriptor.labels.length > 0 || varDescriptor.taint.length > 0) {
        sourceDescriptor = varDescriptor;
      }
    }
  }

  if (sourceDescriptor) {
    return sourceDescriptor;
  }

  return extractDescriptorsFromDataAst(sourceNode, env);
}

export async function evaluateForDirectiveSource(
  directive: ForDirective,
  env: Environment
): Promise<{ iterable: ForSourceIterable; sourceDescriptor?: SecurityDescriptor }> {
  const sourceNode = Array.isArray(directive.values.source)
    ? directive.values.source[0]
    : directive.values.source;
  const sourceResult = await evaluate(sourceNode, env);
  const sourceValue = await materializeForSourceValue(sourceResult.value, env);
  const sourceVarName = (sourceNode as any)?.identifier ?? (sourceNode as any)?.name;
  return {
    iterable: toIterableOrThrow(sourceValue, directive.location),
    sourceDescriptor: resolveSourceDescriptor(sourceVarName, env, sourceResult.value, sourceNode)
  };
}

export async function evaluateForExpressionSource(
  expr: ForExpression,
  env: Environment
): Promise<{ iterable: ForSourceIterable; sourceDescriptor?: SecurityDescriptor }> {
  const sourceResult = await evaluate(expr.source, env, { isExpression: true });
  const sourceValue = await materializeForSourceValue(sourceResult.value, env);
  const sourceVarName = resolveForExpressionSourceName(expr);
  return {
    iterable: toIterableOrThrow(sourceValue, expr.location),
    sourceDescriptor: resolveSourceDescriptor(sourceVarName, env, sourceResult.value, expr.source)
  };
}
