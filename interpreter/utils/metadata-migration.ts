import type {
  VariableContext,
  VariableInternalMetadata,
  VariableMetadata
} from '@core/types/variable';
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

function cloneArray<T>(value?: readonly T[]): readonly T[] {
  if (!value || value.length === 0) {
    return [];
  }
  return Object.freeze([...value]);
}

export function metadataToCtx(metadata?: VariableMetadata): VariableContext {
  const descriptor =
    normalizeSecurityDescriptor(metadata?.security as SecurityDescriptor | undefined) ??
    makeSecurityDescriptor();
  const metrics = metadata?.metrics;
  const loadResult = (metadata?.loadResult ?? {}) as LegacyLoadResult;

  const ctx: VariableContext = {
    labels: descriptor.labels ? cloneArray(descriptor.labels) : EMPTY_LABELS,
    taint: descriptor.taintLevel ?? 'unknown',
    sources: descriptor.sources ? cloneArray(descriptor.sources) : EMPTY_SOURCES,
    policy: descriptor.policyContext ?? null,
    filename: loadResult.filename,
    relative: loadResult.relative,
    absolute: loadResult.absolute,
    url: loadResult.url,
    domain: loadResult.domain,
    title: loadResult.title,
    description: loadResult.description,
    tokest: metrics?.tokest ?? loadResult.tokest,
    tokens: metrics?.tokens ?? loadResult.tokens,
    fm: loadResult.fm,
    json: loadResult.json,
    length: metrics?.length,
    source: metadata?.source,
    retries: metadata?.retries,
    exported: Boolean(metadata?.isImported)
  };

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

export function metadataToInternal(metadata?: VariableMetadata): VariableInternalMetadata {
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

export function ctxToSecurityDescriptor(ctx: VariableContext): SecurityDescriptor {
  return makeSecurityDescriptor({
    labels: ctx.labels ? [...ctx.labels] : [],
    taintLevel: ctx.taint,
    sources: ctx.sources ? [...ctx.sources] : [],
    policyContext: ctx.policy ?? undefined
  });
}

export function updateCtxFromDescriptor(
  ctx: VariableContext,
  descriptor: SecurityDescriptor
): void {
  const normalized = normalizeSecurityDescriptor(descriptor) ?? makeSecurityDescriptor();
  ctx.labels = normalized.labels ? [...normalized.labels] : [];
  ctx.taint = normalized.taintLevel ?? 'unknown';
  ctx.sources = normalized.sources ? [...normalized.sources] : [];
  ctx.policy = normalized.policyContext ?? null;
}

export function hasSecurityContext(ctx: VariableContext): boolean {
  return (ctx.labels?.length ?? 0) > 0 || ctx.taint !== 'unknown';
}

export function serializeSecurityContext(
  ctx: VariableContext
): {
  labels: readonly DataLabel[];
  taint: string;
  sources: readonly string[];
  policy: Readonly<Record<string, unknown>> | null;
} {
  return {
    labels: ctx.labels ?? EMPTY_LABELS,
    taint: ctx.taint ?? 'unknown',
    sources: ctx.sources ?? EMPTY_SOURCES,
    policy: ctx.policy ?? null
  };
}

export function flattenLoadResultToCtx(
  ctx: VariableContext,
  loadResult: LoadContentResult & Partial<LegacyLoadResult>
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
    tokens: Array.isArray(ctx.tokens) ? ctx.tokens.reduce((a, b) => a + Number(b || 0), 0) : ctx.tokens ?? 0,
    fm: ctx.fm,
    json: ctx.json
  };
}
