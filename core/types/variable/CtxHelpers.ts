import type {
  VariableContext,
  VariableInternalMetadata,
  VariableMetadata
} from './VariableTypes';
import type { LoadContentResult } from '@core/types/load-content';
import {
  makeSecurityDescriptor,
  normalizeSecurityDescriptor
} from '@core/types/security';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';

const EMPTY_LABELS: readonly DataLabel[] = Object.freeze([]);
const EMPTY_SOURCES: readonly string[] = Object.freeze([]);

interface LegacyLoadResult extends Partial<LoadContentResult> {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
}

interface LoadResultWithExtras extends Partial<LoadContentResult> {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
}

export function ctxToSecurityDescriptor(ctx: VariableContext): SecurityDescriptor {
  return makeSecurityDescriptor({
    labels: ctx.labels ? [...ctx.labels] : [],
    taint: ctx.taint ? [...ctx.taint] : [],
    sources: ctx.sources ? [...ctx.sources] : [],
    policyContext: ctx.policy ?? undefined
  });
}

export function legacyMetadataToCtx(metadata?: VariableMetadata): VariableContext {
  const descriptor =
    normalizeSecurityDescriptor(metadata?.security as SecurityDescriptor | undefined) ??
    makeSecurityDescriptor();
  const metrics = metadata?.metrics;
  const loadResult = metadata?.loadResult as (LoadContentResult & Partial<LegacyLoadResult>) | undefined;

  const ctx: VariableContext = {
    labels: descriptor.labels ? cloneArray(descriptor.labels) : EMPTY_LABELS,
    taint: descriptor.taint ? cloneArray(descriptor.taint) : [],
    sources: descriptor.sources ? cloneArray(descriptor.sources) : EMPTY_SOURCES,
    policy: descriptor.policyContext ?? null,
    source: metadata?.source,
    retries: metadata?.retries,
    exported: Boolean(metadata?.isImported)
  };

  applyFlattenedLoadMetadata(ctx, metadata as Record<string, unknown> | undefined);

  if (loadResult) {
    flattenLoadResultToCtx(ctx, loadResult);
  }

  if (metrics?.tokest !== undefined && ctx.tokest === undefined) {
    ctx.tokest = metrics.tokest;
  }
  if (metrics?.tokens !== undefined && ctx.tokens === undefined) {
    ctx.tokens = metrics.tokens;
  }
  if (ctx.tokens === undefined && ctx.tokest !== undefined) {
    ctx.tokens = ctx.tokest;
  }
  if (metrics?.length !== undefined && ctx.length === undefined) {
    ctx.length = metrics.length;
  }

  const aggregate = (metadata as Record<string, any> | undefined)?.arrayHelperAggregate;
  if (aggregate) {
    ctx.labels = aggregate.labels ?? ctx.labels;
    ctx.sources = aggregate.sources ?? ctx.sources;
    ctx.tokens = aggregate.tokens ?? ctx.tokens;
    ctx.totalTokens = aggregate.totalTokens ?? ctx.totalTokens;
    ctx.maxTokens = aggregate.maxTokens ?? ctx.maxTokens;
  }

  return ctx;
}

export function legacyMetadataToInternal(metadata?: VariableMetadata): VariableInternalMetadata {
  if (!metadata) {
    return {};
  }

  const {
    security,
    metrics,
    ctxCache,
    loadResult,
    source,
    retries,
    ...rest
  } = metadata;

  return { ...rest };
}

export function updateCtxFromDescriptor(
  ctx: VariableContext,
  descriptor: SecurityDescriptor
): void {
  const normalized = normalizeSecurityDescriptor(descriptor) ?? makeSecurityDescriptor();
  ctx.labels = normalized.labels ? [...normalized.labels] : [];
  ctx.taint = normalized.taint ? [...normalized.taint] : [];
  ctx.sources = normalized.sources ? [...normalized.sources] : [];
  ctx.policy = normalized.policyContext ?? null;
}

export function hasSecurityContext(ctx: VariableContext): boolean {
  return (ctx.labels?.length ?? 0) > 0 || (ctx.taint?.length ?? 0) > 0;
}

export function serializeSecurityContext(
  ctx: VariableContext
): {
  labels: readonly DataLabel[];
  taint: readonly DataLabel[];
  sources: readonly string[];
  policy: Readonly<Record<string, unknown>> | null;
} {
  return {
    labels: ctx.labels ?? EMPTY_LABELS,
    taint: ctx.taint ?? [],
    sources: ctx.sources ?? EMPTY_SOURCES,
    policy: ctx.policy ?? null
  };
}

export function flattenLoadResultToCtx(
  ctx: VariableContext,
  loadResult: LoadContentResult & LoadResultWithExtras
): void {
  ctx.filename = loadResult.filename;
  ctx.relative = loadResult.relative;
  ctx.absolute = loadResult.absolute;
  ctx.tokest = loadResult.tokest ?? ctx.tokest;
  ctx.tokens = loadResult.tokens ?? ctx.tokens;
  ctx.fm = loadResult.fm ?? ctx.fm;
  ctx.json = loadResult.json ?? ctx.json;

  if (loadResult.url) {
    ctx.url = loadResult.url;
    ctx.domain = loadResult.domain ?? ctx.domain;
    ctx.title = loadResult.title ?? ctx.title;
    ctx.description = loadResult.description ?? ctx.description;
  }
}

export function ctxToLoadResult(ctx: VariableContext): LoadContentResult | null {
  if (!ctx.filename || !ctx.relative || !ctx.absolute) {
    return null;
  }

  return {
    content: '',
    filename: ctx.filename,
    relative: ctx.relative,
    absolute: ctx.absolute,
    tokest: ctx.tokest ?? 0,
    tokens: Array.isArray(ctx.tokens)
      ? ctx.tokens.reduce((total, value) => total + Number(value || 0), 0)
      : ctx.tokens ?? 0,
    fm: ctx.fm,
    json: ctx.json
  };
}

function cloneArray<T>(value?: readonly T[]): readonly T[] {
  if (!value || value.length === 0) {
    return [];
  }
  return Object.freeze([...value]);
}

function applyFlattenedLoadMetadata(
  ctx: VariableContext,
  metadata?: Record<string, unknown>
): void {
  if (!metadata) {
    return;
  }
  if (typeof metadata.filename === 'string') {
    ctx.filename = metadata.filename;
  }
  if (typeof metadata.relative === 'string') {
    ctx.relative = metadata.relative;
  }
  if (typeof metadata.absolute === 'string') {
    ctx.absolute = metadata.absolute;
  }
  if (typeof metadata.url === 'string') {
    ctx.url = metadata.url;
  }
  if (typeof metadata.domain === 'string') {
    ctx.domain = metadata.domain;
  }
  if (typeof metadata.title === 'string') {
    ctx.title = metadata.title;
  }
  if (typeof metadata.description === 'string') {
    ctx.description = metadata.description;
  }
  if (typeof metadata.tokest === 'number') {
    ctx.tokest = metadata.tokest;
  }
  if (typeof metadata.tokens === 'number') {
    ctx.tokens = metadata.tokens;
  }
  if (metadata.fm !== undefined) {
    ctx.fm = metadata.fm;
  }
  if (metadata.json !== undefined) {
    ctx.json = metadata.json;
  }
  if (typeof metadata.length === 'number') {
    ctx.length = metadata.length;
  }
}
