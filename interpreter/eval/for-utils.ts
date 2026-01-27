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
  // Shallow unwrapping: extract the iterable from Variables and StructuredValues
  // without recursively deep-copying children. Inner for-expressions handle
  // their own source normalization when they iterate.
  // See: .tickets/m-3b4c.md for why recursive normalization caused OOM.

  if (isVariable(value)) {
    if ((value as Variable).type === 'executable') {
      return value;
    }
    const unwrapped = normalizeIterableValue(value.value);
    attachProvenance(unwrapped, value);
    return unwrapped;
  }

  if (isStructuredValue(value)) {
    const data = asData(value);

    // For arrays inside StructuredValues, extract the array as-is
    // This handles JSON files where the root is an array
    if (Array.isArray(data)) {
      attachProvenance(data, value);
      return data;
    }

    // Preserve StructuredValue for file-loaded items to keep .mx metadata accessible
    // This ensures @f.mx.relative etc. works when iterating over glob results
    if (value.mx?.filename || value.mx?.relative || value.mx?.absolute) {
      return value;
    }

    attachProvenance(data, value);
    return data;
  }

  // Arrays, objects, and primitives pass through as-is
  // LoadContentResult objects are preserved to keep lazy getters (.json, .fm) functional

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
