import { asData, isStructuredValue } from '@interpreter/utils/structured-value';

const SERIALIZED_STRUCTURED_KEYS = new Set(['type', 'data', 'text', 'metadata', 'mx', 'internal']);
const STRUCTURED_TYPE_HINTS = new Set([
  'text',
  'json',
  'array',
  'object',
  'csv',
  'xml',
  'html',
  'null',
  'number',
  'boolean',
  'bigint'
]);

export function unwrapMcpArgPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const unwrapped = unwrapMcpArgValue(payload);
  return isPlainRecord(unwrapped) ? unwrapped : payload;
}

export function unwrapMcpArgList(args: unknown[]): unknown[] {
  return args.map(arg => unwrapMcpArgValue(arg));
}

export function unwrapMcpArgValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (isStructuredValue(value)) {
    return unwrapMcpArgValue(asData(value), seen);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (isSerializedStructuredValue(value)) {
    return unwrapMcpArgValue((value as Record<string, unknown>).data, seen);
  }

  if (Array.isArray(value)) {
    let result: unknown[] | undefined;
    for (let i = 0; i < value.length; i++) {
      const current = value[i];
      const next = unwrapMcpArgValue(current, seen);
      if (next !== current) {
        result ??= value.slice();
        result[i] = next;
      }
    }
    return result ?? value;
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  let result: Record<string, unknown> | undefined;
  for (const [key, current] of Object.entries(value)) {
    const next = unwrapMcpArgValue(current, seen);
    if (next !== current) {
      result ??= { ...value };
      result[key] = next;
    }
  }
  return result ?? value;
}

function isSerializedStructuredValue(value: object): value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.type !== 'string' || !Object.prototype.hasOwnProperty.call(record, 'data')) {
    return false;
  }

  const metadata = isPlainRecord(record.metadata) ? record.metadata : undefined;
  if (metadata?.isStructuredValue === true || metadata?.structuredValueType === record.type) {
    return true;
  }

  const mx = isPlainRecord(record.mx) ? record.mx : undefined;
  if (mx?.type === record.type && Object.prototype.hasOwnProperty.call(record, 'text')) {
    return true;
  }

  const keys = Object.keys(record);
  return (
    keys.length > 0 &&
    keys.every(key => SERIALIZED_STRUCTURED_KEYS.has(key)) &&
    Object.prototype.hasOwnProperty.call(record, 'text') &&
    STRUCTURED_TYPE_HINTS.has(record.type)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
