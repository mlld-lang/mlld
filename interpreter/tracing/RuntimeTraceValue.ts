import { sanitizeSerializableValue } from '@core/errors/errorSerialization';
import { isStructuredValue } from '@interpreter/utils/structured-value';

const TRACE_STRING_PREVIEW_LIMIT = 160;
const TRACE_SIZE_BASE = 1024;
const TRACE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function estimateRuntimeTraceValueBytes(value: unknown): number | undefined {
  try {
    return estimateJsonSize(value, new WeakSet());
  } catch {
    return undefined;
  }
}

function jsonStringSize(value: string): number {
  let size = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    switch (code) {
      case 0x08:
      case 0x09:
      case 0x0a:
      case 0x0c:
      case 0x0d:
      case 0x22:
      case 0x5c:
        size += 2;
        break;
      default:
        size += code < 0x20 ? 6 : 1;
        break;
    }
  }
  return size;
}

function shouldOmitObjectJsonValue(value: unknown): boolean {
  return value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol';
}

function estimateJsonSize(value: unknown, stack: WeakSet<object>, inArray = false): number | undefined {
  if (value === null) {
    return 4;
  }
  if (value === undefined) {
    return inArray ? 4 : undefined;
  }

  switch (typeof value) {
    case 'string':
      return jsonStringSize(value);
    case 'number':
      return Number.isFinite(value) ? String(value).length : 4;
    case 'boolean':
      return value ? 4 : 5;
    case 'bigint':
    case 'function':
    case 'symbol':
      return inArray ? 4 : undefined;
    case 'object':
      break;
    default:
      return String(value).length;
  }

  const objectValue = value as Record<string, unknown>;
  if (stack.has(objectValue)) {
    return undefined;
  }
  stack.add(objectValue);

  try {
    if (isStructuredValue(value)) {
      return estimateJsonSize(value.data, stack, inArray);
    }

    if (Array.isArray(value)) {
      let size = 2;
      for (let index = 0; index < value.length; index += 1) {
        if (index > 0) {
          size += 1;
        }
        size += estimateJsonSize(value[index], stack, true) ?? 4;
      }
      return size;
    }

    let size = 2;
    let first = true;
    for (const key of Object.keys(objectValue)) {
      const entry = objectValue[key];
      if (shouldOmitObjectJsonValue(entry)) {
        continue;
      }
      const entrySize = estimateJsonSize(entry, stack);
      if (entrySize === undefined) {
        return undefined;
      }
      if (!first) {
        size += 1;
      }
      first = false;
      size += jsonStringSize(key) + 1 + entrySize;
    }
    return size;
  } finally {
    stack.delete(objectValue);
  }
}

export function formatRuntimeTraceSize(bytes: number): string {
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
