import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from '../utils/variable-resolution';
import { asData, isStructuredValue } from '../utils/structured-value';

function attachProvenance(target: unknown, source: unknown): void {
  if (!target || typeof target !== 'object') {
    return;
  }
  inheritExpressionProvenance(target, source);
}

export function normalizeIterableValue(value: unknown): unknown {
  if (isVariable(value)) {
    if ((value as Variable).type === 'executable') {
      return value;
    }
    const normalized = normalizeIterableValue(value.value);
    attachProvenance(normalized, value);
    return normalized;
  }

  if (isStructuredValue(value)) {
    const normalized = normalizeIterableValue(asData(value));
    attachProvenance(normalized, value);
    return normalized;
  }

  if (Array.isArray(value)) {
    const normalizedArray = value.map(item => normalizeIterableValue(item));
    attachProvenance(normalizedArray, value);
    return normalizedArray;
  }

  if (value && typeof value === 'object') {
    const normalizedObject: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      normalizedObject[key] = normalizeIterableValue(entry);
    }
    attachProvenance(normalizedObject, value);
    return normalizedObject;
  }

  return value;
}

export function toIterable(value: unknown): Iterable<[string | null, unknown]> | null {
  const normalized = normalizeIterableValue(value);

  if (Array.isArray(normalized)) {
    return normalized.map((item, index) => [String(index), item]);
  }

  if (normalized && typeof normalized === 'object') {
    return Object.entries(normalized as Record<string, unknown>);
  }

  return null;
}
