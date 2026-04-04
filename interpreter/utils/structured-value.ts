import type { SecurityDescriptor, DataLabel, ToolProvenance } from '@core/types/security';
import {
  deserializeSecurityDescriptor,
  makeSecurityDescriptor,
  mergeDescriptors,
  normalizeSecurityDescriptor
} from '@core/types/security';
import { extractUrlsFromValue, replaceDescriptorUrls } from '@core/security/url-provenance';
import { VariableMetadataUtils, type Variable } from '@core/types/variable';
import type { LoadContentResult } from '@core/types/load-content';
import { isLoadContentResult } from '@core/types/load-content';
import { getExpressionProvenance } from './expression-provenance';
import type { RecordProjectionMetadata, RecordSchemaMetadata } from '@core/types/record';
import type { FactSourceHandle } from '@core/types/handle';
import { matchesLabelPattern } from '@core/policy/fact-labels';
import {
  getShelfSlotRefSnapshot,
  isShelfSlotRefValue
} from '@core/types/shelf';

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
  command?: string;
  exitCode?: number;
  duration?: number;
  stderr?: string;
  retries?: number;
  security?: SecurityDescriptor;
  schema?: RecordSchemaMetadata;
  factsources?: readonly FactSourceHandle[];
  projection?: RecordProjectionMetadata;
  loadResult?: StructuredValueLoadResult;
  metrics?: {
    tokens?: number;
    length?: number;
  };
  filename?: string;
  relative?: string;
  absolute?: string;
  path?: string;
  dirname?: string;
  relativeDir?: string;
  absoluteDir?: string;
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
  mx: StructuredValueContext;
  toString(): string;
  valueOf(): string;
  [Symbol.toPrimitive](hint?: string): string;
  readonly [STRUCTURED_VALUE_SYMBOL]: true;
}

export interface StructuredValueContext {
  labels: readonly DataLabel[];
  taint: readonly DataLabel[];
  attestations?: readonly DataLabel[];
  schema?: RecordSchemaMetadata;
  factsources?: readonly FactSourceHandle[];
  sources: readonly string[];
  urls?: readonly string[];
  tools?: readonly ToolProvenance[];
  policy: Readonly<Record<string, unknown>> | null;
  has_label?: (pattern: string) => boolean;
  text?: string;
  data?: unknown;
  keys?: readonly string[];
  values?: readonly unknown[];
  entries?: readonly (readonly [string, unknown])[];
  filename?: string;
  relative?: string;
  absolute?: string;
  path?: string;
  dirname?: string;
  relativeDir?: string;
  absoluteDir?: string;
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  status?: number;
  headers?: Record<string, unknown>;
  html?: string;
  md?: string;
  source?: string;
  command?: string;
  exitCode?: number;
  duration?: number;
  stderr?: string;
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

function varMxToSecurityDescriptor(
  mx: {
    labels?: readonly DataLabel[];
    taint?: string;
    sources?: readonly string[];
    urls?: readonly string[];
    policy?: Readonly<Record<string, unknown>> | null;
  }
): SecurityDescriptor {
  return makeSecurityDescriptor({
    labels: mx.labels ? [...mx.labels] : [],
    taint: Array.isArray(mx.taint) ? [...mx.taint] : [],
    attestations: Array.isArray((mx as { attestations?: readonly DataLabel[] }).attestations)
      ? [...((mx as { attestations?: readonly DataLabel[] }).attestations ?? [])]
      : [],
    sources: mx.sources ? [...mx.sources] : [],
    urls: Array.isArray(mx.urls) ? [...mx.urls] : [],
    tools: Array.isArray((mx as { tools?: readonly ToolProvenance[] }).tools)
      ? [...((mx as { tools?: readonly ToolProvenance[] }).tools ?? [])]
      : [],
    policyContext: mx.policy ?? undefined
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

export function stringifyStructured(value: unknown, space?: number): string {
  return JSON.stringify(value, structuredValueJsonReplacer, space);
}

function stringifyTextValue(value: unknown): string {
  try {
    const text = stringifyStructured(value);
    if (typeof text === 'string') {
      return text;
    }
  } catch {}

  try {
    const text = JSON.stringify(value);
    if (typeof text === 'string') {
      return text;
    }
  } catch {}

  return '[unserializable object]';
}

function structuredValueJsonReplacer(_key: string, val: unknown): unknown {
  if (isStructuredValue(val)) {
    return val.data;
  }
  if (isShelfSlotRefValue(val)) {
    return val.data;
  }
  return val;
}

export function asText(value: unknown): string {
  if (isShelfSlotRefValue(value)) {
    return value.text;
  }
  if (isStructuredValue(value)) {
    return value.text;
  }
  if (isLoadContentResult(value)) {
    return value.content ?? '';
  }
  if (Array.isArray(value)) {
    // For LoadContentResult arrays, join their content
    if (value.length > 0 && isLoadContentResult(value[0])) {
      return value.map(item => item.content ?? '').join('\n\n');
    }
    // For other arrays, recursively call asText on items
    return value.map(item => asText(item)).join('\n\n');
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return stringifyTextValue(value);
  }
  return String(value);
}

export function asData<T = unknown>(value: unknown): T {
  if (isShelfSlotRefValue<T>(value)) {
    return value.data;
  }
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
  if (isShelfSlotRefValue(value)) {
    const snapshot = getShelfSlotRefSnapshot(value);
    if (isStructuredValue(snapshot)) {
      if (typeHint || textOverride || metadata) {
        return wrapStructured(snapshot, typeHint, textOverride, metadata);
      }
      return ensureStructuredValueState(snapshot);
    }
    return ensureStructuredValue(value.data, typeHint, textOverride, metadata);
  }

  if (isStructuredValue(value)) {
    if (typeHint || textOverride || metadata) {
      return wrapStructured(value, typeHint, textOverride, metadata);
    }
    return ensureStructuredValueState(value);
  }

  if (value === null) {
    // Preserve null as a distinct value (not empty string)
    return wrapStructured(null as any, typeHint ?? 'null' as any, 'null', metadata);
  }

  if (value === undefined) {
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
  const resolvedMetadata = cloneMetadataWithDerivedUrls(data, resolvedText, metadata);
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

function cloneMetadataWithDerivedUrls(
  data: unknown,
  text: string,
  metadata?: StructuredValueMetadata
): StructuredValueMetadata | undefined {
  const urls = extractUrlsFromValue([data, text]);
  const normalizedDescriptor = normalizeSecurityDescriptor(metadata?.security as SecurityDescriptor | undefined);
  const security = replaceDescriptorUrls(normalizedDescriptor, urls);

  if (!metadata && !security) {
    return undefined;
  }

  const cloned = {
    ...(metadata ? { ...metadata } : {}),
    ...(security ? { security } : {})
  } as StructuredValueMetadata;
  return Object.freeze(cloned);
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
  if (typeof value === 'object') {
    return stringifyTextValue(value);
  }
  return String(value);
}

export const structuredValueUtils = {
  STRUCTURED_VALUE_SYMBOL,
  asText,
  asData,
  stringifyStructured,
  looksLikeJsonString,
  parseAndWrapJson,
  wrapStructured,
  isStructuredValue,
  ensureStructuredValue,
  getRecordProjectionMetadata,
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
  const resolvedDescriptor =
    replaceDescriptorUrls(normalized, extractUrlsFromValue([value.data, value.text])) ?? normalized;
  value.metadata = {
    ...(value.metadata ?? {}),
    security: resolvedDescriptor
  };
  value.mx.labels = resolvedDescriptor.labels ? [...resolvedDescriptor.labels] : [];
  value.mx.taint = resolvedDescriptor.taint ? [...resolvedDescriptor.taint] : [];
  value.mx.attestations = resolvedDescriptor.attestations ? [...resolvedDescriptor.attestations] : [];
  value.mx.sources = resolvedDescriptor.sources ? [...resolvedDescriptor.sources] : [];
  value.mx.urls = resolvedDescriptor.urls ? [...resolvedDescriptor.urls] : [];
  value.mx.tools = resolvedDescriptor.tools ? [...resolvedDescriptor.tools] : [];
  value.mx.policy = resolvedDescriptor.policyContext ?? null;
}

export function getRecordProjectionMetadata(
  value: unknown
): RecordProjectionMetadata | undefined {
  if (isShelfSlotRefValue(value)) {
    return getRecordProjectionMetadata(value.current);
  }
  if (!isStructuredValue(value)) {
    return undefined;
  }
  return value.metadata?.projection as RecordProjectionMetadata | undefined;
}

export function setRecordProjectionMetadata(
  value: StructuredValue,
  projection: RecordProjectionMetadata
): void {
  value.metadata = {
    ...(value.metadata ?? {}),
    projection
  };
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
  const descriptor = Object.getOwnPropertyDescriptor(value, 'mx');
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
  setCtx(value, buildVarMxFromMetadata(metadata, type));
}

function setCtx<T>(value: StructuredValue<T>, mx: StructuredValueContext | undefined): void {
  const resolvedCtx: StructuredValueContext =
    mx ?? buildVarMxFromMetadata(value.metadata, value.type);
  if (!resolvedCtx.type) {
    resolvedCtx.type = value.type;
  }
  Object.defineProperty(value, 'mx', {
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
    setCtx(value, buildVarMxFromMetadata(value.metadata, value.type));
  }
  if (!(value as any)[STRUCTURED_VALUE_INTERNAL_INITIALIZED]) {
    setInternal(value, value.internal ?? {});
  }
}

function buildVarMxFromMetadata(
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
  const flattenedPath = metadata?.path as string | undefined;
  const flattenedDirname = metadata?.dirname as string | undefined;
  const flattenedRelativeDir = metadata?.relativeDir as string | undefined;
  const flattenedAbsoluteDir = metadata?.absoluteDir as string | undefined;
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
  const flattenedMd = metadata?.md as string | undefined;
  const labels = normalizeLabelArray(normalizedDescriptor.labels);
  const taint = normalizeLabelArray(normalizedDescriptor.taint);
  const attestations = normalizeLabelArray(normalizedDescriptor.attestations);
  const sources = normalizedDescriptor.sources ?? EMPTY_SOURCES;

  const context: StructuredValueContext = {
    labels,
    taint,
    attestations,
    schema: metadata?.schema,
    factsources: Array.isArray(metadata?.factsources) ? [...metadata.factsources] : undefined,
    sources,
    urls: normalizedDescriptor.urls ? [...normalizedDescriptor.urls] : [],
    tools: normalizedDescriptor.tools ? [...normalizedDescriptor.tools] : [],
    policy: normalizedDescriptor.policyContext ?? null,
    filename: flattenedFilename ?? loadResult?.filename,
    relative: flattenedRelative ?? loadResult?.relative,
    absolute: flattenedAbsolute ?? loadResult?.absolute,
    path: flattenedPath ?? (loadResult?.path as string | undefined) ?? flattenedAbsolute ?? loadResult?.absolute,
    dirname: flattenedDirname,
    relativeDir: flattenedRelativeDir,
    absoluteDir: flattenedAbsoluteDir,
    url: flattenedUrl ?? loadResult?.url,
    domain: flattenedDomain ?? loadResult?.domain,
    title: flattenedTitle ?? loadResult?.title,
    description: flattenedDescription ?? loadResult?.description,
    status: flattenedStatus,
    headers: flattenedHeaders,
    html: flattenedHtml,
    md: flattenedMd,
    source: metadata?.source,
    command: metadata?.command,
    exitCode: metadata?.exitCode,
    duration: metadata?.duration,
    stderr: metadata?.stderr,
    retries: metadata?.retries,
    tokest: flattenedTokest ?? loadResult?.tokest,
    tokens: flattenedTokens,
    fm: flattenedFm,
    json: flattenedJson,
    length: flattenedLength,
    type
  };
  context.has_label = (pattern: string): boolean => {
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      return false;
    }
    const values = [
      ...(context.labels ?? []),
      ...(context.taint ?? []),
      ...(context.attestations ?? [])
    ];
    return values.some(value => matchesLabelPattern(pattern, value));
  };
  return context;
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
    const mxDescriptor = variable?.mx ? varMxToSecurityDescriptor(variable.mx) : undefined;
    if (mxDescriptor) {
      descriptors.push(mxDescriptor);
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

  const provenanceDescriptor = normalizeIfNeeded(
    getExpressionProvenance(value),
    options.normalize
  );

  if (isShelfSlotRefValue(value)) {
    const currentDescriptor = extractDescriptorInternal(value.current, options, seen);
    return mergeDescriptorSources(provenanceDescriptor, currentDescriptor);
  }

  if (isStructuredValue(value)) {
    const metadataDescriptor = mergeDescriptorSources(
      provenanceDescriptor,
      normalizeIfNeeded(candidateMetadataSecurity(value), options.normalize)
      ?? normalizeIfNeeded(varMxToSecurityDescriptor(value.mx), options.normalize)
    );
    if (!options.recursive) {
      return normalizeIfNeeded(metadataDescriptor, options.normalize);
    }

    if (seen.has(value)) {
      return normalizeIfNeeded(metadataDescriptor, options.normalize);
    }
    seen.add(value);

    const nestedDescriptors = getStructuredChildValues(value)
      .map(item => extractDescriptorInternal(item, options, seen))
      .filter(isSecurityDescriptor);

    if (nestedDescriptors.length === 0) {
      return normalizeIfNeeded(metadataDescriptor, options.normalize);
    }

    if (metadataDescriptor) {
      if (Array.isArray(value.data) && !options.mergeArrayElements && nestedDescriptors.length > 1) {
        return mergeDescriptors(metadataDescriptor, nestedDescriptors[0]);
      }
      return mergeDescriptors(metadataDescriptor, ...nestedDescriptors);
    }

    if (Array.isArray(value.data) && !options.mergeArrayElements && nestedDescriptors.length > 1) {
      return nestedDescriptors[0];
    }
    if (nestedDescriptors.length === 1) {
      return nestedDescriptors[0];
    }
    return mergeDescriptors(...nestedDescriptors);
  }

  if (isVariableLike(value)) {
    const descriptor = value.mx
      ? normalizeIfNeeded(varMxToSecurityDescriptor(value.mx), options.normalize)
      : undefined;
    return mergeDescriptorSources(provenanceDescriptor, descriptor);
  }

  if (!options.recursive || typeof value !== 'object') {
    return provenanceDescriptor;
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

  const candidate = value as {
    metadata?: { security?: SecurityDescriptor };
    mx?: {
      labels?: readonly DataLabel[];
      taint?: string;
      attestations?: readonly DataLabel[];
      sources?: readonly string[];
      tools?: readonly ToolProvenance[];
      policy?: Readonly<Record<string, unknown>> | null;
    };
  };
  const metadataDescriptor = mergeDescriptorSources(
    provenanceDescriptor,
    candidate.mx
      ? normalizeIfNeeded(varMxToSecurityDescriptor(candidate.mx as any), options.normalize)
      : normalizeIfNeeded(candidate.metadata?.security as SecurityDescriptor | undefined, options.normalize)
  );
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

function candidateMetadataSecurity(
  value: { metadata?: { security?: SecurityDescriptor } }
): SecurityDescriptor | undefined {
  return value.metadata?.security;
}

function getStructuredNamespaceMetadata(
  value: StructuredValue
): Record<string, unknown> | undefined {
  const namespaceMetadata = value.internal &&
    typeof value.internal === 'object' &&
    'namespaceMetadata' in value.internal
      ? (value.internal as Record<string, unknown>).namespaceMetadata
      : undefined;
  return namespaceMetadata && typeof namespaceMetadata === 'object'
    ? namespaceMetadata as Record<string, unknown>
    : undefined;
}

function deserializeNamespaceChildDescriptor(
  payload: Record<string, unknown>
): SecurityDescriptor | undefined {
  const legacyDescriptor = VariableMetadataUtils.deserializeSecurityMetadata(
    payload as ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>
  ).security;
  return legacyDescriptor ?? deserializeSecurityDescriptor(payload.security as any);
}

function materializeStructuredNamespaceChild(
  fieldValue: unknown,
  payload: Record<string, unknown>
): unknown {
  const descriptor = deserializeNamespaceChildDescriptor(payload);
  const hasFactsources = Array.isArray(payload.factsources);
  const hasProjection = Boolean(payload.projection && typeof payload.projection === 'object');
  if (!descriptor && !hasFactsources && !hasProjection) {
    return fieldValue;
  }

  const child = isStructuredValue(fieldValue)
    ? fieldValue
    : wrapStructured(fieldValue as any);

  if (descriptor) {
    applySecurityDescriptorToStructuredValue(child, descriptor);
  }
  if (hasFactsources) {
    child.metadata = {
      ...(child.metadata ?? {}),
      factsources: [...(payload.factsources as readonly FactSourceHandle[])]
    };
    child.mx.factsources = [...(payload.factsources as readonly FactSourceHandle[])];
  }
  if (hasProjection) {
    setRecordProjectionMetadata(child, payload.projection as RecordProjectionMetadata);
  }
  return child;
}

export function getStructuredChildValues(value: StructuredValue): unknown[] {
  if (Array.isArray(value.data)) {
    return value.data;
  }

  if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
    return [];
  }

  const objectData = value.data as Record<string, unknown>;
  const namespaceMetadata = getStructuredNamespaceMetadata(value);
  if (!namespaceMetadata) {
    return Object.values(objectData);
  }

  const children: unknown[] = [];
  for (const [fieldName, fieldValue] of Object.entries(objectData)) {
    const rawMetadata = namespaceMetadata[fieldName];
    if (!rawMetadata || typeof rawMetadata !== 'object') {
      children.push(fieldValue);
      continue;
    }
    children.push(materializeStructuredNamespaceChild(fieldValue, rawMetadata as Record<string, unknown>));
  }
  return children;
}

export function getStructuredObjectField(
  value: StructuredValue,
  fieldName: string
): unknown {
  if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
    return undefined;
  }

  const objectData = value.data as Record<string, unknown>;
  const fieldValue = objectData[fieldName];
  const namespaceMetadata = getStructuredNamespaceMetadata(value);
  if (!namespaceMetadata) {
    return fieldValue;
  }

  const rawMetadata = namespaceMetadata[fieldName];
  if (!rawMetadata || typeof rawMetadata !== 'object') {
    return fieldValue;
  }

  return materializeStructuredNamespaceChild(fieldValue, rawMetadata as Record<string, unknown>);
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

function mergeDescriptorSources(
  left: SecurityDescriptor | undefined,
  right: SecurityDescriptor | undefined
): SecurityDescriptor | undefined {
  if (left && right) {
    return mergeDescriptors(left, right);
  }
  return left ?? right;
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

  if (value && typeof value === 'object' && '__whenEffect' in (value as Record<string, unknown>)) {
    return { normalized: '', hadShowEffect: false };
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
    if (data && typeof data === 'object' && '__whenEffect' in (data as Record<string, unknown>)) {
      return { normalized: '', hadShowEffect: false };
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
