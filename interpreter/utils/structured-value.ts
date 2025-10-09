export const STRUCTURED_VALUE_SYMBOL = Symbol.for('mlld.StructuredValue');

export type StructuredValueType =
  | 'text'
  | 'json'
  | 'array'
  | 'object'
  | 'csv'
  | 'xml'
  | (string & {});

export interface StructuredValueMetadata {
  source?: string;
  retries?: number;
  [key: string]: unknown;
}

export interface StructuredValue<T = unknown> {
  type: StructuredValueType;
  text: string;
  data: T;
  metadata?: StructuredValueMetadata;
  toString(): string;
  valueOf(): string;
  [Symbol.toPrimitive](hint?: string): string;
  readonly [STRUCTURED_VALUE_SYMBOL]: true;
}

export function isStructuredValue<T = unknown>(value: unknown): value is StructuredValue<T> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)[STRUCTURED_VALUE_SYMBOL] === true &&
      typeof (value as Record<string, unknown>).text === 'string' &&
      typeof (value as Record<string, unknown>).type === 'string'
  );
}

export function asText(value: unknown): string {
  if (isStructuredValue(value)) {
    return value.text;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

export function asData<T = unknown>(value: unknown): T {
  if (isStructuredValue<T>(value)) {
    return value.data;
  }
  throw new TypeError('Structured value required: data view is unavailable');
}

export function wrapStructured<T>(
  value: StructuredValue<T>,
  type?: StructuredValueType,
  text?: string,
  metadata?: StructuredValueMetadata
): StructuredValue<T>;
export function wrapStructured<T>(
  value: T,
  type: StructuredValueType,
  text?: string,
  metadata?: StructuredValueMetadata
): StructuredValue<T>;
export function wrapStructured<T>(
  value: StructuredValue<T> | T,
  type?: StructuredValueType,
  text?: string,
  metadata?: StructuredValueMetadata
): StructuredValue<T> {
  if (isStructuredValue<T>(value)) {
    if (!type && !text && !metadata) {
      return value;
    }
    if (process.env.MLLD_DEBUG_STRUCTURED === 'true') {
      try {
        const dataKeys = value.data && typeof value.data === 'object'
          ? Object.keys(value.data as Record<string, unknown>)
          : undefined;
        console.error('[wrapStructured] cloning structured', {
          typeHint: type,
          hasMetadata: Boolean(metadata),
          dataKeys
        });
      } catch {}
    }
    return createStructuredValue(
      value.data,
      type ?? value.type,
      text ?? value.text,
      metadata ?? value.metadata
    );
  }

  const resolvedType = type ?? 'text';
  const resolvedText = text ?? deriveText(value);
  return createStructuredValue(value, resolvedType, resolvedText, metadata);
}

export function ensureStructuredValue(
  value: unknown,
  typeHint?: StructuredValueType,
  textOverride?: string,
  metadata?: StructuredValueMetadata
): StructuredValue {
  if (isStructuredValue(value)) {
    if (typeHint || textOverride || metadata) {
      return wrapStructured(value, typeHint, textOverride, metadata);
    }
    return value;
  }

  if (value === null || value === undefined) {
    return wrapStructured('', typeHint ?? 'text', '', metadata);
  }

  if (typeof value === 'string') {
    const resolvedText = textOverride ?? value;
    return wrapStructured(value, typeHint ?? 'text', resolvedText, metadata);
  }

  if (Array.isArray(value)) {
    return wrapStructured(value, typeHint ?? 'array', textOverride, metadata);
  }

  if (typeof value === 'object') {
    return wrapStructured(value as Record<string, unknown>, typeHint ?? 'object', textOverride, metadata);
  }

  const primitiveText = textOverride ?? String(value);
  return wrapStructured(value, typeHint ?? 'text', primitiveText, metadata);
}

function createStructuredValue<T>(
  data: T,
  type: StructuredValueType,
  text: string,
  metadata?: StructuredValueMetadata
): StructuredValue<T> {
  const resolvedText = text ?? '';
  const structuredValue: StructuredValue<T> = {
    type,
    text: resolvedText,
    data,
    metadata,
    toString() {
      return resolvedText;
    },
    valueOf() {
      return resolvedText;
    },
    [Symbol.toPrimitive]() {
      return resolvedText;
    },
    [STRUCTURED_VALUE_SYMBOL]: true as const
  };

  return structuredValue;
}

function deriveText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const structuredValueUtils = {
  STRUCTURED_VALUE_SYMBOL,
  asText,
  asData,
  wrapStructured,
  isStructuredValue,
  ensureStructuredValue
};
