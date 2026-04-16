/**
 * Summarizer for audit-log payloads.
 *
 * Tool-call args can carry entire runtime structures (captured module envs,
 * executable definitions, AST nodes) that serialize to megabytes each.
 * This summarizer drops that plumbing before JSON.stringify while preserving
 * the parts an auditor actually needs: shape, primitive values, short strings,
 * and security-relevant identifiers.
 */

export interface AuditSummarizeOptions {
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
}

const DEFAULTS: Required<AuditSummarizeOptions> = {
  maxDepth: 6,
  maxArrayLength: 50,
  maxObjectKeys: 50,
  maxStringLength: 512
};

/**
 * Keys whose values are runtime plumbing — never useful in an audit and the
 * primary cause of multi-megabyte audit lines. Dropped wherever they appear.
 */
const DROPPED_KEYS = new Set([
  'capturedModuleEnv',
  'capturedEnv',
  'executableDef',
  'codeTemplate',
  'parentEnvironment',
  'parent',
  'securityRuntime',
  'moduleProcessingCache',
  'sourceCache',
  'runtimeTraceManager',
  'contextManager',
  'variableManager',
  'resolverManager',
  'pathContext',
  'pathService',
  'fileSystem',
  'environment'
]);

/**
 * Class-name check via duck typing so we don't import Environment (which would
 * introduce a cycle: core/security -> interpreter/env -> core/security).
 */
const DROPPED_CLASS_NAMES = new Set([
  'Environment',
  'RuntimeTraceManager',
  'ContextManager',
  'PolicyEnforcer',
  'SigService',
  'NodeFileSystem',
  'MemoryFileSystem'
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAstNodeShape(value: Record<string, unknown>): boolean {
  return (
    typeof value.nodeId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.location === 'object' &&
    value.location !== null
  );
}

function classMarker(value: object): string {
  const name = value.constructor?.name;
  return name && name !== 'Object' ? `[${name}]` : '[Object]';
}

function summarizeString(value: string, limit: number): unknown {
  if (value.length <= limit) {
    return value;
  }
  return {
    __str: `${value.slice(0, limit)}`,
    len: value.length,
    truncated: value.length - limit
  };
}

function summarize(
  value: unknown,
  opts: Required<AuditSummarizeOptions>,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const t = typeof value;

  if (t === 'function' || t === 'symbol') {
    return undefined;
  }

  if (t === 'bigint') {
    return (value as bigint).toString();
  }

  if (t === 'string') {
    return summarizeString(value as string, opts.maxStringLength);
  }

  if (t === 'number' || t === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    const msg = typeof value.message === 'string' ? value.message : String(value);
    return {
      __error: value.name || 'Error',
      message: summarizeString(msg, opts.maxStringLength)
    };
  }

  if (value instanceof Map) {
    return summarize(Object.fromEntries(value), opts, depth, seen);
  }

  if (value instanceof Set) {
    return summarize(Array.from(value), opts, depth, seen);
  }

  if (typeof value === 'object') {
    const ctorName = (value as object).constructor?.name;
    if (ctorName && DROPPED_CLASS_NAMES.has(ctorName)) {
      return `[${ctorName}]`;
    }

    if (seen.has(value as object)) {
      return '[Circular]';
    }

    if (depth >= opts.maxDepth) {
      return classMarker(value as object);
    }

    seen.add(value as object);

    if (Array.isArray(value)) {
      const slice = value.slice(0, opts.maxArrayLength);
      const out: unknown[] = slice.map(entry =>
        summarize(entry, opts, depth + 1, seen)
      );
      if (value.length > opts.maxArrayLength) {
        out.push({ __omitted: value.length - opts.maxArrayLength });
      }
      return out;
    }

    if (!isPlainObject(value)) {
      return classMarker(value as object);
    }

    const record = value as Record<string, unknown>;

    if (isAstNodeShape(record)) {
      return { __ast: record.type };
    }

    const entries = Object.entries(record);
    const out: Record<string, unknown> = {};
    let kept = 0;

    for (const [key, entry] of entries) {
      if (kept >= opts.maxObjectKeys) {
        out.__truncatedKeys = entries.length - kept;
        break;
      }

      if (DROPPED_KEYS.has(key)) {
        out[key] = '[omitted]';
        kept += 1;
        continue;
      }

      // Special-case the mlld wrapper that exec tools attach to structured
      // values. Keep the identifying bits; drop the .internal plumbing.
      if (key === 'mlld' && isPlainObject(entry) && 'internal' in (entry as Record<string, unknown>)) {
        const mlldEntry = entry as Record<string, unknown>;
        const trimmed: Record<string, unknown> = {};
        for (const mk of ['type', 'name', 'paramNames', 'description']) {
          if (mk in mlldEntry) {
            trimmed[mk] = summarize(mlldEntry[mk], opts, depth + 2, seen);
          }
        }
        trimmed.internal = '[omitted]';
        out[key] = trimmed;
        kept += 1;
        continue;
      }

      const summarized = summarize(entry, opts, depth + 1, seen);
      if (summarized !== undefined) {
        out[key] = summarized;
        kept += 1;
      }
    }

    return out;
  }

  return String(value);
}

export function summarizeAuditValue(
  value: unknown,
  options: AuditSummarizeOptions = {}
): unknown {
  const opts: Required<AuditSummarizeOptions> = {
    ...DEFAULTS,
    ...options
  };
  return summarize(value, opts, 0, new WeakSet<object>());
}

export const AUDIT_DEFAULT_MAX_RECORD_BYTES = 64 * 1024;

/**
 * Final-size backstop: if a JSON-serialized record still exceeds the cap
 * after field-level summarization, replace the heavy fields with a stub
 * so at least the event/taint/tool metadata survive.
 */
export function enforceAuditRecordCap(
  record: Record<string, unknown>,
  maxBytes: number = AUDIT_DEFAULT_MAX_RECORD_BYTES
): Record<string, unknown> {
  let serialized: string;
  try {
    serialized = JSON.stringify(record);
  } catch {
    return {
      ...record,
      args: { __truncated: true, reason: 'serialize-failed' },
      detail: undefined
    };
  }

  if (serialized.length <= maxBytes) {
    return record;
  }

  const stubbed: Record<string, unknown> = { ...record };

  if ('args' in stubbed && stubbed.args !== undefined) {
    const argKeys = isPlainObject(stubbed.args) ? Object.keys(stubbed.args as Record<string, unknown>) : undefined;
    stubbed.args = {
      __truncated: true,
      bytes: serialized.length,
      ...(argKeys ? { argKeys } : {})
    };
  }

  if ('detail' in stubbed && typeof stubbed.detail === 'string') {
    const detail = stubbed.detail;
    if (detail.length > 2048) {
      stubbed.detail = `${detail.slice(0, 2048)}… [truncated ${detail.length - 2048} chars]`;
    }
  }

  try {
    const reSerialized = JSON.stringify(stubbed);
    if (reSerialized.length <= maxBytes) {
      return stubbed;
    }
  } catch {
    // fall through
  }

  return {
    id: record.id,
    ts: record.ts,
    event: record.event,
    tool: record.tool,
    args: { __truncated: true, bytes: serialized.length, reason: 'record-over-cap' }
  };
}
