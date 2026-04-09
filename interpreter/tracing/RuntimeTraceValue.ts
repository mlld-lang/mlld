import { sanitizeSerializableValue } from '@core/errors/errorSerialization';

const TRACE_STRING_PREVIEW_LIMIT = 160;
const TRACE_SIZE_BASE = 1024;
const TRACE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

function estimateRuntimeTraceValueBytes(value: unknown): number | undefined {
  const sanitized = sanitizeSerializableValue(value);
  if (sanitized === undefined) {
    return undefined;
  }
  try {
    return Buffer.byteLength(JSON.stringify(sanitized), 'utf8');
  } catch {
    return undefined;
  }
}

function formatRuntimeTraceSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < TRACE_SIZE_BASE) {
    return `${bytes} B`;
  }

  let value = bytes;
  let unitIndex = 0;
  while (value >= TRACE_SIZE_BASE && unitIndex < TRACE_SIZE_UNITS.length - 1) {
    value /= TRACE_SIZE_BASE;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${TRACE_SIZE_UNITS[unitIndex]}`;
}

function withRuntimeTraceSize<T extends Record<string, unknown>>(summary: T, value: unknown): T & {
  bytes: number;
  human: string;
} {
  const bytes = estimateRuntimeTraceValueBytes(value);
  if (bytes === undefined) {
    return {
      ...summary,
      bytes: 0,
      human: '0 B'
    };
  }

  return {
    ...summary,
    bytes,
    human: formatRuntimeTraceSize(bytes)
  };
}

export function summarizeRuntimeTraceValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > TRACE_STRING_PREVIEW_LIMIT
      ? `${value.slice(0, TRACE_STRING_PREVIEW_LIMIT - 3)}...`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return withRuntimeTraceSize({
      kind: 'array',
      length: value.length
    }, value);
  }
  if (typeof value === 'object') {
    if ('handle' in (value as Record<string, unknown>) && typeof (value as { handle?: unknown }).handle === 'string') {
      return withRuntimeTraceSize({ handle: (value as { handle: string }).handle }, value);
    }
    const keys = Object.keys(value as Record<string, unknown>);
    return withRuntimeTraceSize({
      kind: 'object',
      keys: keys.slice(0, 8),
      size: keys.length
    }, value);
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
