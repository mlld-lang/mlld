import type { SecurityDescriptor, DataLabel, TaintLevel } from '@core/types/security';
import { makeSecurityDescriptor, normalizeSecurityDescriptor } from '@core/types/security';

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
  security?: SecurityDescriptor;
  metrics?: {
    tokens?: number;
    length?: number;
  };
  [key: string]: unknown;
}

export interface StructuredValue<T = unknown> {
  type: StructuredValueType;
  text: string;
  data: T;
  metadata?: StructuredValueMetadata;
  readonly ctx: StructuredValueContext;
  toString(): string;
  valueOf(): string;
  [Symbol.toPrimitive](hint?: string): string;
  readonly [STRUCTURED_VALUE_SYMBOL]: true;
}

export interface StructuredValueContext {
  labels: readonly DataLabel[];
  taint: TaintLevel;
  sources: readonly string[];
  tokens?: number;
  length?: number;
  type: StructuredValueType;
}

const STRUCTURED_VALUE_CTX_ATTACHED = Symbol('mlld.StructuredValueCtxAttached');
const EMPTY_LABELS: readonly DataLabel[] = Object.freeze([]);

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

export function looksLikeJsonString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return false;
  }
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
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
      return attachContextToStructuredValue(value);
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
    return attachContextToStructuredValue(
      createStructuredValue(
        value.data,
        type ?? value.type,
        text ?? value.text,
        metadata ?? value.metadata
      )
    );
  }

  const resolvedType = type ?? 'text';
  const resolvedText = text ?? deriveText(value);
  return attachContextToStructuredValue(createStructuredValue(value, resolvedType, resolvedText, metadata));
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

  if (typeof value === 'number') {
    const resolvedText = textOverride ?? String(value);
    return wrapStructured(value, typeHint ?? 'number', resolvedText, metadata);
  }

  if (typeof value === 'boolean') {
    const resolvedText = textOverride ?? String(value);
    return wrapStructured(value, typeHint ?? 'boolean', resolvedText, metadata);
  }

  if (typeof value === 'bigint') {
    const resolvedText = textOverride ?? value.toString();
    return wrapStructured(value, typeHint ?? 'bigint', resolvedText, metadata);
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
  const resolvedMetadata = cloneMetadata(metadata);
  const structuredValue: StructuredValue<T> = {
    type,
    text: resolvedText,
    data,
    metadata: resolvedMetadata,
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

  return attachContextToStructuredValue(structuredValue);
}

function cloneMetadata(metadata?: StructuredValueMetadata): StructuredValueMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  if (Object.isFrozen(metadata)) {
    return metadata;
  }
  return Object.freeze({ ...metadata });
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
  looksLikeJsonString,
  wrapStructured,
  isStructuredValue,
  ensureStructuredValue,
  attachContextToStructuredValue
};

export function attachContextToStructuredValue<T>(value: StructuredValue<T>): StructuredValue<T> {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if ((value as any)[STRUCTURED_VALUE_CTX_ATTACHED]) {
    return value;
  }
  Object.defineProperty(value, STRUCTURED_VALUE_CTX_ATTACHED, {
    value: true,
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(value, 'ctx', {
    enumerable: false,
    configurable: true,
    get() {
      return buildStructuredValueContext(value);
    }
  });
  return value;
}

function buildStructuredValueContext(value: StructuredValue): StructuredValueContext {
  const descriptor =
    normalizeSecurityDescriptor(value.metadata?.security as SecurityDescriptor | undefined) ?? makeSecurityDescriptor();
  const metrics = value.metadata?.metrics;
  const labels = normalizeLabelArray(descriptor?.labels);
  return Object.freeze({
    labels,
    taint: descriptor.taintLevel ?? 'unknown',
    sources: descriptor.sources ?? [],
    tokens: metrics?.tokens,
    length: metrics?.length,
    type: value.type
  });
}

function normalizeLabelArray(
  labels: readonly DataLabel[] | DataLabel | undefined | null
): readonly DataLabel[] {
  if (Array.isArray(labels)) {
    return labels;
  }
  if (labels === undefined || labels === null) {
    return EMPTY_LABELS;
  }
  return [labels];
}
