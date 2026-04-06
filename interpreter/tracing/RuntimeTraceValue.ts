import { sanitizeSerializableValue } from '@core/errors/errorSerialization';

export function summarizeRuntimeTraceValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return {
      kind: 'array',
      length: value.length
    };
  }
  if (typeof value === 'object') {
    if ('handle' in (value as Record<string, unknown>) && typeof (value as { handle?: unknown }).handle === 'string') {
      return { handle: (value as { handle: string }).handle };
    }
    const keys = Object.keys(value as Record<string, unknown>);
    return {
      kind: 'object',
      keys: keys.slice(0, 8),
      size: keys.length
    };
  }
  return String(value);
}

export function fingerprintRuntimeTraceValue(value: unknown): string {
  const sanitized = sanitizeSerializableValue(value);
  if (sanitized === undefined) {
    return JSON.stringify({ __runtimeTraceUndefined: true });
  }
  return JSON.stringify(sanitized);
}
