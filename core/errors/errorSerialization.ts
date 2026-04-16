import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  isEnvironmentTagged
} from '@core/utils/environment-identity';

interface ValueSanitizerOptions {
  maxDepth?: number;
  maxObjectKeys?: number;
  maxArrayLength?: number;
}

export interface ErrorSerializationOptions extends ValueSanitizerOptions {
  includeStack?: boolean;
  includeDetails?: boolean;
  maxCauseDepth?: number;
  maxStackLength?: number;
}

export interface SerializableValueOptions extends ValueSanitizerOptions {
  errorOptions?: ErrorSerializationOptions;
}

export interface ErrorSnapshot {
  class: string;
  name: string;
  message: string;
  code?: string;
  severity?: string;
  phase?: string;
  direction?: string;
  hint?: string;
  tool?: string;
  field?: string;
  arg?: string;
  reason?: string;
  sourceLocation?: unknown;
  details?: unknown;
  cause?: unknown;
}

const DEFAULT_VALUE_OPTIONS: Required<ValueSanitizerOptions> = {
  maxDepth: 6,
  maxObjectKeys: 50,
  maxArrayLength: 50
};

const DEFAULT_ERROR_OPTIONS: Required<Omit<ErrorSerializationOptions, 'includeStack' | 'includeDetails'>> & {
  includeStack: boolean;
  includeDetails: boolean;
} = {
  maxDepth: 6,
  maxObjectKeys: 50,
  maxArrayLength: 50,
  maxCauseDepth: 3,
  maxStackLength: 12000,
  includeStack: true,
  includeDetails: false
};

const INTERNAL_STATE_KEYS = new Set([
  'env',
  'environment',
  'securityManager',
  'securityManagers',
  'resolverManager',
  'resolverManagers',
  'pathContext',
  'pathContexts',
  'pathService',
  'variableManager',
  'variableManagers',
  'contextManager',
  'fileSystem'
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function summarizeObject(value: object): string {
  const name = value.constructor?.name;
  return name && name !== 'Object' ? `[${name}]` : '[Object]';
}

export function truncateText(value: string, maxLength = 0): string {
  if (maxLength <= 0 || value.length <= maxLength) {
    return value;
  }

  const preserved = Math.max(32, maxLength - 32);
  const headLength = Math.ceil(preserved * 0.75);
  const tailLength = preserved - headLength;
  const truncated = value.length - (headLength + tailLength);

  return `${value.slice(0, headLength)} ... [truncated ${truncated} chars] ... ${value.slice(-tailLength)}`;
}

function sanitizeValueInternal(
  value: unknown,
  options: SerializableValueOptions,
  depth: number,
  seen: WeakSet<object>
): unknown {
  const resolvedOptions = {
    ...DEFAULT_VALUE_OPTIONS,
    ...options
  };

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (isEnvironmentTagged(value)) {
    return ENVIRONMENT_SERIALIZE_PLACEHOLDER;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value, options.errorOptions ?? {}, depth, seen);
  }

  if (value instanceof Map) {
    return sanitizeValueInternal(Object.fromEntries(value), options, depth, seen);
  }

  if (value instanceof Set) {
    return sanitizeValueInternal(Array.from(value), options, depth, seen);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (depth >= resolvedOptions.maxDepth) {
    return summarizeObject(value);
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, resolvedOptions.maxArrayLength)
      .map(entry => sanitizeValueInternal(entry, options, depth + 1, seen))
      .filter(entry => entry !== undefined);

    if (value.length > resolvedOptions.maxArrayLength) {
      sanitized.push(`[+${value.length - resolvedOptions.maxArrayLength} more items]`);
    }

    return sanitized;
  }

  if (!isPlainObject(value)) {
    return summarizeObject(value);
  }

  const entries = Object.entries(value);
  const output: Record<string, unknown> = {};

  for (const [key, entry] of entries.slice(0, resolvedOptions.maxObjectKeys)) {
    if (INTERNAL_STATE_KEYS.has(key) && entry && typeof entry === 'object') {
      output[key] = '[omitted internal state]';
      continue;
    }

    if (key === 'baseValue' && entry && typeof entry === 'object') {
      output[key] = summarizeObject(entry);
      continue;
    }

    const sanitizedEntry = sanitizeValueInternal(entry, options, depth + 1, seen);
    if (sanitizedEntry !== undefined) {
      output[key] = sanitizedEntry;
    }
  }

  if (entries.length > resolvedOptions.maxObjectKeys) {
    output.__truncatedKeys = entries.length - resolvedOptions.maxObjectKeys;
  }

  return output;
}

export function sanitizeSerializableValue(
  value: unknown,
  options: SerializableValueOptions = {}
): unknown {
  return sanitizeValueInternal(value, options, 0, new WeakSet<object>());
}

export function sanitizeErrorDetails(
  value: unknown,
  options: SerializableValueOptions = {}
): unknown {
  return sanitizeSerializableValue(value, {
    maxDepth: 6,
    maxObjectKeys: 50,
    maxArrayLength: 50,
    ...options
  });
}

export function serializeError(
  error: unknown,
  options: ErrorSerializationOptions = {},
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  const resolvedOptions = {
    ...DEFAULT_ERROR_OPTIONS,
    ...options
  };

  if (!(error instanceof Error)) {
    return sanitizeValueInternal(error, resolvedOptions, depth, seen);
  }

  if (seen.has(error)) {
    return {
      name: error.name || 'Error',
      message: '[Circular error cause]'
    };
  }

  seen.add(error);

  const summary: Record<string, unknown> = {
    name: error.name || 'Error',
    message: error.message || String(error)
  };

  const withMeta = error as Error & {
    code?: unknown;
    filePath?: unknown;
    severity?: unknown;
    sourceLocation?: unknown;
    details?: unknown;
    cause?: unknown;
  };

  if (typeof withMeta.code === 'string' && withMeta.code.length > 0) {
    summary.code = withMeta.code;
  }

  if (typeof withMeta.filePath === 'string' && withMeta.filePath.length > 0) {
    summary.filePath = withMeta.filePath;
  }

  if (typeof withMeta.severity === 'string' && withMeta.severity.length > 0) {
    summary.severity = withMeta.severity;
  }

  if (withMeta.sourceLocation !== undefined) {
    const sourceLocation = sanitizeValueInternal(withMeta.sourceLocation, resolvedOptions, 0, seen);
    if (sourceLocation !== undefined) {
      summary.sourceLocation = sourceLocation;
    }
  }

  if (resolvedOptions.includeDetails && withMeta.details !== undefined) {
    const details = sanitizeValueInternal(withMeta.details, resolvedOptions, 0, seen);
    if (details !== undefined) {
      summary.details = details;
    }
  }

  if (resolvedOptions.includeStack && typeof error.stack === 'string') {
    summary.stack = truncateText(error.stack, resolvedOptions.maxStackLength);
  }

  if (depth < resolvedOptions.maxCauseDepth && withMeta.cause !== undefined) {
    summary.cause = withMeta.cause instanceof Error
      ? serializeError(withMeta.cause, { ...resolvedOptions, includeStack: false }, depth + 1, seen)
      : sanitizeValueInternal(withMeta.cause, resolvedOptions, 0, seen);
  }

  return summary;
}

export function cloneErrorForTransport(
  error: unknown,
  options: ErrorSerializationOptions = {},
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  const resolvedOptions = {
    ...DEFAULT_ERROR_OPTIONS,
    ...options
  };

  if (!(error instanceof Error)) {
    return sanitizeValueInternal(error, resolvedOptions, 0, seen);
  }

  if (seen.has(error)) {
    return new Error('[Circular error cause]');
  }

  seen.add(error);

  const cloned = new Error(error.message || String(error));
  cloned.name = error.name || 'Error';

  const withMeta = error as Error & {
    code?: unknown;
    filePath?: unknown;
    severity?: unknown;
    sourceLocation?: unknown;
    details?: unknown;
    cause?: unknown;
  };

  if (typeof withMeta.code === 'string' && withMeta.code.length > 0) {
    (cloned as any).code = withMeta.code;
  }

  if (typeof withMeta.filePath === 'string' && withMeta.filePath.length > 0) {
    (cloned as any).filePath = withMeta.filePath;
  }

  if (typeof withMeta.severity === 'string' && withMeta.severity.length > 0) {
    (cloned as any).severity = withMeta.severity;
  }

  if (withMeta.sourceLocation !== undefined) {
    const sourceLocation = sanitizeValueInternal(withMeta.sourceLocation, resolvedOptions, 0, seen);
    if (sourceLocation !== undefined) {
      (cloned as any).sourceLocation = sourceLocation;
    }
  }

  if (resolvedOptions.includeDetails && withMeta.details !== undefined) {
    const details = sanitizeValueInternal(withMeta.details, resolvedOptions, 0, seen);
    if (details !== undefined) {
      (cloned as any).details = details;
    }
  }

  if (resolvedOptions.includeStack && typeof error.stack === 'string') {
    cloned.stack = truncateText(error.stack, resolvedOptions.maxStackLength);
  }

  if (depth < resolvedOptions.maxCauseDepth && withMeta.cause !== undefined) {
    (cloned as any).cause = withMeta.cause instanceof Error
      ? cloneErrorForTransport(withMeta.cause, { ...resolvedOptions, includeStack: false }, depth + 1, seen)
      : sanitizeValueInternal(withMeta.cause, resolvedOptions, 0, seen);
  }

  return cloned;
}

export const summarizeError = serializeError;
export const toJsonSafe = sanitizeSerializableValue;

export function createErrorSnapshot(
  error: unknown,
  options: ErrorSerializationOptions = {}
): unknown {
  const serialized = serializeError(error, {
    includeDetails: true,
    includeStack: false,
    ...options
  });

  if (!serialized || typeof serialized !== 'object' || Array.isArray(serialized)) {
    return serialized;
  }

  const record = serialized as Record<string, unknown>;
  const details =
    record.details && typeof record.details === 'object' && !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : undefined;

  const snapshot: ErrorSnapshot = {
    class:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : 'Error',
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : 'Error',
    message:
      typeof record.message === 'string'
        ? record.message
        : String(record.message ?? 'Unknown error')
  };

  for (const key of ['code', 'severity'] as const) {
    if (typeof record[key] === 'string' && record[key].trim().length > 0) {
      snapshot[key] = record[key] as string;
    }
  }

  for (const key of ['phase', 'direction', 'hint', 'tool', 'field', 'arg', 'reason'] as const) {
    if (typeof details?.[key] === 'string' && (details[key] as string).trim().length > 0) {
      snapshot[key] = details[key] as string;
    }
  }

  if (record.sourceLocation !== undefined) {
    snapshot.sourceLocation = record.sourceLocation;
  }

  if (details !== undefined) {
    snapshot.details = details;
  }

  if (record.cause !== undefined) {
    snapshot.cause = record.cause;
  }

  return snapshot;
}
