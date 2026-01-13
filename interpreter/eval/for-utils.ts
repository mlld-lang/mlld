import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from '../utils/variable-resolution';
import { asData, isStructuredValue } from '../utils/structured-value';
import { isLoadContentResult } from '@core/types/load-content';

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
    const data = asData(value);

    // For arrays inside StructuredValues, extract and normalize the array
    // This handles JSON files where the root is an array - we need to iterate
    // over the array elements, not the StructuredValue properties
    if (Array.isArray(data)) {
      const normalizedArray = data.map(item => normalizeIterableValue(item));
      attachProvenance(normalizedArray, value);
      return normalizedArray;
    }

    // Preserve StructuredValue for file-loaded items to keep .mx metadata accessible
    // This ensures @f.mx.relative etc. works when iterating over glob results
    // (individual file entries, not arrays)
    if (value.mx?.filename || value.mx?.relative || value.mx?.absolute) {
      return value;
    }

    const normalized = normalizeIterableValue(data);
    attachProvenance(normalized, value);
    return normalized;
  }

  if (Array.isArray(value)) {
    const normalizedArray = value.map(item => normalizeIterableValue(item));
    attachProvenance(normalizedArray, value);
    return normalizedArray;
  }

  // Preserve LoadContentResult objects to keep lazy getters (.json, .fm) functional
  if (isLoadContentResult(value)) {
    return value;
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
