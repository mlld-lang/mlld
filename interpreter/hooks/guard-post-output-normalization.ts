import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { EvalResult } from '../core/interpreter';
import {
  applySecurityDescriptorToStructuredValue,
  ensureStructuredValue
} from '../utils/structured-value';
import { isVariable } from '../utils/variable-resolution';

function getOwnValue(
  candidate: unknown,
  key: 'text' | 'data'
): unknown {
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
  if (!descriptor || !('value' in descriptor)) {
    return undefined;
  }
  return descriptor.value;
}

export function normalizeRawOutput(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const textValue = getOwnValue(value, 'text');
    if (textValue !== undefined) {
      return textValue;
    }

    const dataValue = getOwnValue(value, 'data');
    if (dataValue !== undefined) {
      return dataValue;
    }
  }
  return value;
}

export function normalizeFallbackOutputValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

export function normalizeReplacementVariables(value: unknown): Variable[] {
  if (isVariable(value as Variable)) {
    return [value as Variable];
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).filter(item => isVariable(item as Variable)) as Variable[];
  }
  return [];
}

export function buildTransformedGuardResult(
  result: EvalResult,
  finalVariable: Variable,
  finalValue: unknown,
  descriptor: SecurityDescriptor
): EvalResult {
  if (typeof finalValue === 'string') {
    const structured = ensureStructuredValue(finalValue, 'text', finalValue);
    applySecurityDescriptorToStructuredValue(structured, descriptor);
    const nextResult = { ...result, value: structured };
    (nextResult as any).stdout = finalValue;
    (nextResult as any).__guardTransformed = structured;
    return nextResult;
  }

  const nextResult = { ...result, value: finalVariable };
  (nextResult as any).__guardTransformed = finalVariable;
  return nextResult;
}
