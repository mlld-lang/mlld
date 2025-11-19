import type { SecurityDescriptor } from '@core/types/security';
import { formatForDisplay, type DisplayFormatOptions } from './display-formatter';
import { extractSecurityDescriptor, isStructuredValue } from './structured-value';
import { getExpressionProvenance, inheritExpressionProvenance } from './expression-provenance';
import { isVariable } from './variable-resolution';

export interface MaterializedDisplayValue {
  text: string;
  descriptor: SecurityDescriptor | undefined;
}

export interface ResolveNestedValueOptions {
  preserveProvenance?: boolean;
}

export function materializeDisplayValue(
  value: unknown,
  options?: DisplayFormatOptions,
  descriptorSource?: unknown
): MaterializedDisplayValue {
  const provenanceSource = descriptorSource ?? value;
  const descriptor =
    getExpressionProvenance(provenanceSource) ??
    extractSecurityDescriptor(provenanceSource, {
      recursive: true,
      mergeArrayElements: true
    });
  const text = formatForDisplay(value, options);
  return { text, descriptor };
}

export function resolveNestedValue(
  value: unknown,
  options?: ResolveNestedValueOptions
): unknown {
  const preserve = options?.preserveProvenance ?? false;
  return resolveNestedValueInternal(value, preserve);
}

function resolveNestedValueInternal(value: unknown, preserve: boolean): unknown {
  if (isVariable(value)) {
    const resolved = resolveNestedValueInternal(value.value, preserve);
    inheritIfNeeded(resolved, value, preserve);
    return resolved;
  }

  if (isStructuredValue(value)) {
    const resolved = resolveNestedValueInternal(value.data, preserve);
    inheritIfNeeded(resolved, value, preserve);
    return resolved;
  }

  if (Array.isArray(value)) {
    const resolvedArray = value.map(entry => resolveNestedValueInternal(entry, preserve));
    inheritIfNeeded(resolvedArray, value, preserve);
    return resolvedArray;
  }

  if (value && typeof value === 'object') {
    const resolvedObject: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      resolvedObject[key] = resolveNestedValueInternal(entry, preserve);
    }
    inheritIfNeeded(resolvedObject, value, preserve);
    return resolvedObject;
  }

  return value;
}

function inheritIfNeeded(target: unknown, source: unknown, preserve: boolean): void {
  if (!preserve || !target || typeof target !== 'object') {
    return;
  }
  inheritExpressionProvenance(target, source);
}
