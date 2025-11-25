import type { SecurityDescriptor, DataLabel, TaintLevel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors, normalizeSecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { LoadContentResult } from '@core/types/load-content';
import { getExpressionProvenance } from './expression-provenance';

export const STRUCTURED_VALUE_SYMBOL = Symbol.for('mlld.StructuredValue');
const STRUCTURED_VALUE_CTX_INITIALIZED = Symbol('mlld.StructuredValueCtxInitialized');
const STRUCTURED_VALUE_INTERNAL_INITIALIZED = Symbol('mlld.StructuredValueInternalInitialized');

export type StructuredValueType =
  | 'text'
  | 'json'
  | 'array'
  | 'object'
  | 'csv'
  | 'xml'
  | 'html'
  | (string & {});

type StructuredValueLoadResult = Partial<LoadContentResult> & {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
};

export interface StructuredValueMetadata {
  source?: string;
  retries?: number;
  security?: SecurityDescriptor;
  loadResult?: StructuredValueLoadResult;
  metrics?: {
    tokens?: number;
    length?: number;
  };
  filename?: string;
  relative?: string;
  absolute?: string;
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  status?: number;
  headers?: Record<string, unknown>;
  fm?: unknown;
  json?: unknown;
  tokest?: number;
  tokens?: number;
  length?: number;
  html?: string;
  [key: string]: unknown;
}

export interface StructuredValueInternal extends Record<string, unknown> {}

export interface StructuredValue<T = unknown> {
  type: StructuredValueType;
  text: string;
  data: T;
  metadata?: StructuredValueMetadata;
  internal?: StructuredValueInternal;
  ctx: StructuredValueContext;
  toString(): string;
  valueOf(): string;
  [Symbol.toPrimitive](hint?: string): string;
  readonly [STRUCTURED_VALUE_SYMBOL]: true;
}

export interface StructuredValueContext {
  labels: readonly DataLabel[];
  taint: TaintLevel;
  sources: readonly string[];
  policy: Readonly<Record<string, unknown>> | null;
  filename?: string;
  relative?: string;
  absolute?: string;
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  status?: number;
  headers?: Record<string, unknown>;
  html?: string;
  source?: string;
  retries?: number;
  tokest?: number;
  tokens?: number;
  fm?: unknown;
  json?: unknown;
  length?: number;
  type: StructuredValueType;
}

const EMPTY_LABELS: readonly DataLabel[] = Object.freeze([]);
const EMPTY_SOURCES: readonly string[] = Object.freeze([]);
const DEV_ENV = typeof process !== 'undefined' ? process.env : undefined;
const SHOULD_ASSERT_STRUCTURED =
  DEV_ENV?.MLLD_DEV_ASSERTIONS === 'true' || DEV_ENV?.MLLD_DEBUG_STRUCTURED === 'true';

function ctxToSecurityDescriptor(ctx: { labels?: readonly DataLabel[]; taint?: string; sources?: readonly string[]; policy?: Readonly<Record<string, unknown>> | null }): SecurityDescriptor {
  return makeSecurityDescriptor({
    labels: ctx.labels ? [...ctx.labels] : [],
    taintLevel: ctx.taint as TaintLevel | undefined,
    sources: ctx.sources ? [...ctx.sources] : [],
    policyContext: ctx.policy ?? undefined
  });
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

export function keepStructured<T = unknown>(value: unknown): StructuredValue<T> {
  if (isStructuredValue<T>(value)) {
    return value;
  }
  return ensureStructuredValue(value) as StructuredValue<T>;
}

export function keep<T = unknown>(value: unknown): StructuredValue<T> {
  return keepStructured(value);
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

export interface ParseJsonOptions {
  metadata?: StructuredValueMetadata;
  preserveText?: boolean;
  strict?: boolean;
}

export function parseAndWrapJson(
  value: string,
  options: ParseJsonOptions = {}
): StructuredValue | string | undefined {
  if (!looksLikeJsonString(value)) {
    return options.strict ? undefined : value;
  }

  try {
    const parsed = JSON.parse(value.trim());
    const type: StructuredValueType =
      Array.isArray(parsed) ? 'array' : typeof parsed === 'object' && parsed !== null ? 'object' : 'json';
    const text = options.preserveText ? value : JSON.stringify(parsed);
    return wrapStructured(parsed, type, text, options.metadata);
  } catch {
    return options.strict ? undefined : value;
  }
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
      return ensureStructuredValueState(value);
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
    return ensureStructuredValueState(value);
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
  const structuredValue = {
    type,
    text: resolvedText,
    data,
    metadata: resolvedMetadata,
    [STRUCTURED_VALUE_SYMBOL]: true as const,
    toString() {
      return resolvedText;
    },
    valueOf() {
      return resolvedText;
    },
    [Symbol.toPrimitive]() {
      return resolvedText;
    }
  } as StructuredValue<T>;

  defineStructuredCtx(structuredValue, resolvedMetadata, type);
  defineStructuredInternal(structuredValue, {});
  markStructuredValueInitialized(structuredValue);
  return structuredValue;
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
  parseAndWrapJson,
  wrapStructured,
  isStructuredValue,
  ensureStructuredValue,
  collectParameterDescriptors,
  collectAndMergeParameterDescriptors,
  extractSecurityDescriptor,
  assertStructuredValue
};

export function applySecurityDescriptorToStructuredValue(
  value: StructuredValue,
  descriptor: SecurityDescriptor
): void {
  const normalized = normalizeSecurityDescriptor(descriptor) ?? makeSecurityDescriptor();
  value.metadata = {
    ...(value.metadata ?? {}),
    security: normalized
  };
  value.ctx.labels = normalized.labels ? [...normalized.labels] : [];
  value.ctx.taint = normalized.taintLevel ?? 'unknown';
  value.ctx.sources = normalized.sources ? [...normalized.sources] : [];
  value.ctx.policy = normalized.policyContext ?? null;
}

function ensureStructuredValueState<T>(value: StructuredValue<T>): StructuredValue<T> {
  defineStructuredCtx(value, value.metadata, value.type);
  defineStructuredInternal(value, value.internal);
  markStructuredValueInitialized(value);
  return value;
}

function defineStructuredCtx<T>(
  value: StructuredValue<T>,
  metadata: StructuredValueMetadata | undefined,
  type: StructuredValueType
): void {
  if ((value as any)[STRUCTURED_VALUE_CTX_INITIALIZED]) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'ctx');
  if (descriptor?.get) {
    const derived = descriptor.get.call(value) as StructuredValueContext;
    setCtx(value, derived);
    return;
  }
  if (descriptor && 'value' in descriptor && descriptor.value) {
    if (!descriptor.enumerable && descriptor.writable !== false) {
      (value as any)[STRUCTURED_VALUE_CTX_INITIALIZED] = true;
      return;
    }
    setCtx(value, descriptor.value as StructuredValueContext);
    return;
  }
  setCtx(value, buildCtxFromMetadata(metadata, type));
}

function setCtx<T>(value: StructuredValue<T>, ctx: StructuredValueContext | undefined): void {
  const resolvedCtx: StructuredValueContext =
    ctx ?? buildCtxFromMetadata(value.metadata, value.type);
  if (!resolvedCtx.type) {
    resolvedCtx.type = value.type;
  }
  Object.defineProperty(value, 'ctx', {
    value: resolvedCtx,
    enumerable: false,
    configurable: true,
    writable: true
  });
  (value as any)[STRUCTURED_VALUE_CTX_INITIALIZED] = true;
}

function defineStructuredInternal<T>(
  value: StructuredValue<T>,
  initial: StructuredValueInternal | undefined
): void {
  if ((value as any)[STRUCTURED_VALUE_INTERNAL_INITIALIZED]) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'internal');
  if (descriptor?.get) {
    const derived = descriptor.get.call(value) as StructuredValueInternal;
    setInternal(value, derived ?? {});
    return;
  }
  if (descriptor && 'value' in descriptor && descriptor.value) {
    if (!descriptor.enumerable && descriptor.writable !== false) {
      (value as any)[STRUCTURED_VALUE_INTERNAL_INITIALIZED] = true;
      return;
    }
    setInternal(value, descriptor.value as StructuredValueInternal);
    return;
  }
  setInternal(value, initial ?? {});
}

function setInternal<T>(value: StructuredValue<T>, internal: StructuredValueInternal): void {
  Object.defineProperty(value, 'internal', {
    value: internal,
    enumerable: false,
    configurable: true,
    writable: true
  });
  (value as any)[STRUCTURED_VALUE_INTERNAL_INITIALIZED] = true;
}

function markStructuredValueInitialized<T>(value: StructuredValue<T>): void {
  if (!(value as any)[STRUCTURED_VALUE_CTX_INITIALIZED]) {
    setCtx(value, buildCtxFromMetadata(value.metadata, value.type));
  }
  if (!(value as any)[STRUCTURED_VALUE_INTERNAL_INITIALIZED]) {
    setInternal(value, value.internal ?? {});
  }
}

function buildCtxFromMetadata(
  metadata: StructuredValueMetadata | undefined,
  type: StructuredValueType
): StructuredValueContext {
  const descriptor = normalizeSecurityDescriptor(metadata?.security as SecurityDescriptor | undefined);
  const normalizedDescriptor = descriptor ?? makeSecurityDescriptor();
  const metrics = metadata?.metrics;
  const loadResult = extractLoadResult(metadata);
  const flattenedFilename = metadata?.filename as string | undefined;
  const flattenedRelative = metadata?.relative as string | undefined;
  const flattenedAbsolute = metadata?.absolute as string | undefined;
  const flattenedUrl = metadata?.url as string | undefined;
  const flattenedDomain = metadata?.domain as string | undefined;
  const flattenedTitle = metadata?.title as string | undefined;
  const flattenedDescription = metadata?.description as string | undefined;
  const flattenedStatus = metadata?.status as number | undefined;
  const flattenedHeaders = metadata?.headers as Record<string, unknown> | undefined;
  const flattenedTokest = (metadata?.tokest as number | undefined) ?? metrics?.tokest;
  const flattenedTokens = (metadata?.tokens as number | undefined) ?? metrics?.tokens ?? loadResult?.tokens;
  const flattenedFm = metadata?.fm ?? loadResult?.fm;
  const flattenedJson = metadata?.json ?? loadResult?.json;
  const flattenedLength =
    (metadata?.length as number | undefined) ?? metrics?.length ?? loadResult?.content?.length;
  const flattenedHtml = metadata?.html as string | undefined;
  const labels = normalizeLabelArray(normalizedDescriptor.labels);
  const sources = normalizedDescriptor.sources ?? EMPTY_SOURCES;

  return {
    labels,
    taint: normalizedDescriptor.taintLevel ?? 'unknown',
    sources,
    policy: normalizedDescriptor.policyContext ?? null,
    filename: flattenedFilename ?? loadResult?.filename,
    relative: flattenedRelative ?? loadResult?.relative,
    absolute: flattenedAbsolute ?? loadResult?.absolute,
    url: flattenedUrl ?? loadResult?.url,
    domain: flattenedDomain ?? loadResult?.domain,
    title: flattenedTitle ?? loadResult?.title,
    description: flattenedDescription ?? loadResult?.description,
    status: flattenedStatus,
    headers: flattenedHeaders,
    html: flattenedHtml,
    source: metadata?.source,
    retries: metadata?.retries,
    tokest: flattenedTokest ?? loadResult?.tokest,
    tokens: flattenedTokens,
    fm: flattenedFm,
    json: flattenedJson,
    length: flattenedLength,
    type
  };
}

function extractLoadResult(
  metadata?: StructuredValueMetadata
): StructuredValueLoadResult | undefined {
  if (!metadata) {
    return undefined;
  }
  const loadResult = metadata.loadResult;
  if (!loadResult || typeof loadResult !== 'object') {
    return undefined;
  }
  return loadResult;
}

export function assertStructuredValue<T = unknown>(
  value: unknown,
  context?: string
): asserts value is StructuredValue<T> {
  if (!SHOULD_ASSERT_STRUCTURED || isStructuredValue<T>(value)) {
    return;
  }
  const detail = context ? ` (${context})` : '';
  throw new TypeError(`StructuredValue required${detail}`);
}

interface ParameterLookup {
  getVariable(name: string): Variable | undefined;
}

interface ParameterMerge extends ParameterLookup {
  mergeSecurityDescriptors: (...descriptors: SecurityDescriptor[]) => SecurityDescriptor;
}

export function collectParameterDescriptors(
  params: readonly string[],
  env: ParameterLookup
): SecurityDescriptor[] {
  const descriptors: SecurityDescriptor[] = [];
  for (const name of params) {
    const variable = env.getVariable(name);
    const ctxDescriptor = variable?.ctx ? ctxToSecurityDescriptor(variable.ctx) : undefined;
    if (ctxDescriptor) {
      descriptors.push(ctxDescriptor);
    }
  }
  return descriptors;
}

export function collectAndMergeParameterDescriptors(
  params: readonly string[],
  env: ParameterMerge
): SecurityDescriptor | undefined {
  const descriptors = collectParameterDescriptors(params, env);
  if (descriptors.length === 0) {
    return undefined;
  }
  if (descriptors.length === 1) {
    return descriptors[0];
  }
  return env.mergeSecurityDescriptors(...descriptors);
}

export interface ExtractSecurityDescriptorOptions {
  recursive?: boolean;
  normalize?: boolean;
  mergeArrayElements?: boolean;
}

export function extractSecurityDescriptor(
  value: unknown,
  options: ExtractSecurityDescriptorOptions = {}
): SecurityDescriptor | undefined {
  const resolvedOptions: Required<ExtractSecurityDescriptorOptions> = {
    recursive: false,
    normalize: true,
    mergeArrayElements: false,
    ...options
  };
  return extractDescriptorInternal(value, resolvedOptions, new WeakSet());
}

function extractDescriptorInternal(
  value: unknown,
  options: Required<ExtractSecurityDescriptorOptions>,
  seen: WeakSet<object>
): SecurityDescriptor | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const provenanceDescriptor = getExpressionProvenance(value);
  if (provenanceDescriptor) {
    return normalizeIfNeeded(provenanceDescriptor, options.normalize);
  }

  if (isStructuredValue(value)) {
    const descriptor = ctxToSecurityDescriptor(value.ctx);
    return normalizeIfNeeded(descriptor, options.normalize);
  }

  if (isVariableLike(value)) {
    const descriptor = value.ctx ? ctxToSecurityDescriptor(value.ctx) : undefined;
    return normalizeIfNeeded(descriptor, options.normalize);
  }

  if (!options.recursive || typeof value !== 'object') {
    return undefined;
  }

  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const descriptors = value
      .map(item => extractDescriptorInternal(item, options, seen))
      .filter(isSecurityDescriptor);
    if (descriptors.length === 0) {
      return undefined;
    }
    if (options.mergeArrayElements && descriptors.length > 1) {
      return mergeDescriptors(...descriptors);
    }
    return descriptors[0];
  }

  const candidate = value as { metadata?: { security?: SecurityDescriptor }; ctx?: { labels?: readonly DataLabel[]; taint?: string; sources?: readonly string[]; policy?: Readonly<Record<string, unknown>> | null } };
  const metadataDescriptor = candidate.ctx
    ? normalizeIfNeeded(ctxToSecurityDescriptor(candidate.ctx as any), options.normalize)
    : normalizeIfNeeded(candidate.metadata?.security as SecurityDescriptor | undefined, options.normalize);
  const nestedDescriptors = Object.values(value as Record<string, unknown>)
    .map(item => extractDescriptorInternal(item, options, seen))
    .filter(isSecurityDescriptor);

  if (nestedDescriptors.length === 0) {
    return metadataDescriptor;
  }

  if (metadataDescriptor) {
    return mergeDescriptors(metadataDescriptor, ...nestedDescriptors);
  }
  if (nestedDescriptors.length === 1) {
    return nestedDescriptors[0];
  }
  return mergeDescriptors(...nestedDescriptors);
}

function isSecurityDescriptor(value: SecurityDescriptor | undefined): value is SecurityDescriptor {
  return Boolean(value);
}

function normalizeIfNeeded(
  descriptor: SecurityDescriptor | undefined,
  normalize: boolean
): SecurityDescriptor | undefined {
  if (!descriptor) {
    return undefined;
  }
  return normalize ? normalizeSecurityDescriptor(descriptor) : descriptor;
}

export interface WhenShowEffectResult {
  normalized: unknown;
  hadShowEffect: boolean;
  text?: string;
}

/**
 * Normalize when-expression show effects so that callers receive the text version
 * while retaining knowledge that the value originated from a side-effect show.
 */
export function normalizeWhenShowEffect(value: unknown): WhenShowEffectResult {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).__whenEffect === 'show') {
    const text = typeof (value as { text?: string }).text === 'string' ? (value as { text?: string }).text : '';
    return { normalized: text, hadShowEffect: true, text };
  }

  if (isStructuredValue(value)) {
    const data = asData(value);
    if (data && typeof data === 'object' && (data as Record<string, unknown>).__whenEffect === 'show') {
      const text =
        typeof (data as { text?: string }).text === 'string'
          ? (data as { text?: string }).text
          : asText(value);
      return { normalized: text, hadShowEffect: true, text };
    }
  }

  return { normalized: value, hadShowEffect: false };
}

function isVariableLike(value: unknown): value is Variable {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.name === 'string' &&
    'value' in candidate &&
    'source' in candidate
  );
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
