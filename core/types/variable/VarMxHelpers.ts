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

export function varMxToSecurityDescriptor(mx: VariableContext): SecurityDescriptor {
  return makeSecurityDescriptor({
    labels: mx.labels ? [...mx.labels] : [],
    taint: mx.taint ? [...mx.taint] : [],
    sources: mx.sources ? [...mx.sources] : [],
    policyContext: mx.policy ?? undefined
  });
}

export function legacyMetadataToVarMx(metadata?: VariableMetadata): VariableContext {
  const descriptor =
    normalizeSecurityDescriptor(metadata?.security as SecurityDescriptor | undefined) ??
    makeSecurityDescriptor();
  const metrics = metadata?.metrics;
  const loadResult = metadata?.loadResult as (LoadContentResult & Partial<LegacyLoadResult>) | undefined;

  const mx: VariableContext = {
    labels: descriptor.labels ? cloneArray(descriptor.labels) : EMPTY_LABELS,
    taint: descriptor.taint ? cloneArray(descriptor.taint) : [],
    sources: descriptor.sources ? cloneArray(descriptor.sources) : EMPTY_SOURCES,
    policy: descriptor.policyContext ?? null,
    source: metadata?.source,
    retries: metadata?.retries,
    exported: Boolean(metadata?.isImported),
    isImported: metadata?.isImported,
    importPath: metadata?.importPath
  };

  applyFlattenedLoadMetadata(mx, metadata as Record<string, unknown> | undefined);

  if (loadResult) {
    flattenLoadResultToVarMx(mx, loadResult);
  }

  if (metrics?.tokest !== undefined && mx.tokest === undefined) {
    mx.tokest = metrics.tokest;
  }
  if (metrics?.tokens !== undefined && mx.tokens === undefined) {
    mx.tokens = metrics.tokens;
  }
  if (mx.tokens === undefined && mx.tokest !== undefined) {
    mx.tokens = mx.tokest;
  }
  if (metrics?.length !== undefined && mx.length === undefined) {
    mx.length = metrics.length;
  }

  const aggregate = (metadata as Record<string, any> | undefined)?.arrayHelperAggregate;
  if (aggregate) {
    mx.labels = aggregate.labels ?? mx.labels;
    mx.sources = aggregate.sources ?? mx.sources;
    mx.tokens = aggregate.tokens ?? mx.tokens;
    mx.totalTokens = aggregate.totalTokens ?? mx.totalTokens;
    mx.maxTokens = aggregate.maxTokens ?? mx.maxTokens;
  }

  return mx;
}

export function legacyMetadataToInternal(metadata?: VariableMetadata): VariableInternalMetadata {
  if (!metadata) {
    return {};
  }

  const {
    security,
    metrics,
    mxCache,
    loadResult,
    source,
    retries,
    ...rest
  } = metadata;

  return { ...rest };
}

export function updateVarMxFromDescriptor(
  mx: VariableContext,
  descriptor: SecurityDescriptor
): void {
  const normalized = normalizeSecurityDescriptor(descriptor) ?? makeSecurityDescriptor();
  mx.labels = normalized.labels ? [...normalized.labels] : [];
  mx.taint = normalized.taint ? [...normalized.taint] : [];
  mx.sources = normalized.sources ? [...normalized.sources] : [];
  mx.policy = normalized.policyContext ?? null;
}

export function hasSecurityVarMx(mx: VariableContext): boolean {
  return (mx.labels?.length ?? 0) > 0 || (mx.taint?.length ?? 0) > 0;
}

export function serializeSecurityVarMx(
  mx: VariableContext
): {
  labels: readonly DataLabel[];
  taint: readonly DataLabel[];
  sources: readonly string[];
  policy: Readonly<Record<string, unknown>> | null;
} {
  return {
    labels: mx.labels ?? EMPTY_LABELS,
    taint: mx.taint ?? [],
    sources: mx.sources ?? EMPTY_SOURCES,
    policy: mx.policy ?? null
  };
}

export function flattenLoadResultToVarMx(
  mx: VariableContext,
  loadResult: LoadContentResult & LoadResultWithExtras
): void {
  mx.filename = loadResult.filename;
  mx.relative = loadResult.relative;
  mx.absolute = loadResult.absolute;
  mx.path = loadResult.path ?? loadResult.absolute;
  mx.tokest = loadResult.tokest ?? mx.tokest;
  mx.tokens = loadResult.tokens ?? mx.tokens;
  mx.fm = loadResult.fm ?? mx.fm;
  mx.json = loadResult.json ?? mx.json;

  if (loadResult.url) {
    mx.url = loadResult.url;
    mx.domain = loadResult.domain ?? mx.domain;
    mx.title = loadResult.title ?? mx.title;
    mx.description = loadResult.description ?? mx.description;
  }
}

export function varMxToLoadResult(mx: VariableContext): LoadContentResult | null {
  if (!mx.filename || !mx.relative || !mx.absolute) {
    return null;
  }

  return {
    content: '',
    filename: mx.filename,
    relative: mx.relative,
    absolute: mx.absolute,
    path: mx.path ?? mx.absolute,
    tokest: mx.tokest ?? 0,
    tokens: Array.isArray(mx.tokens)
      ? mx.tokens.reduce((total, value) => total + Number(value || 0), 0)
      : mx.tokens ?? 0,
    fm: mx.fm,
    json: mx.json
  };
}

function cloneArray<T>(value?: readonly T[]): readonly T[] {
  if (!value || value.length === 0) {
    return [];
  }
  return Object.freeze([...value]);
}

function applyFlattenedLoadMetadata(
  mx: VariableContext,
  metadata?: Record<string, unknown>
): void {
  if (!metadata) {
    return;
  }
  if (typeof metadata.filename === 'string') {
    mx.filename = metadata.filename;
  }
  if (typeof metadata.relative === 'string') {
    mx.relative = metadata.relative;
  }
  if (typeof metadata.absolute === 'string') {
    mx.absolute = metadata.absolute;
  }
  if (typeof metadata.path === 'string') {
    mx.path = metadata.path;
  } else if (mx.path === undefined && typeof metadata.absolute === 'string') {
    mx.path = metadata.absolute;
  }
  if (typeof metadata.url === 'string') {
    mx.url = metadata.url;
  }
  if (typeof metadata.domain === 'string') {
    mx.domain = metadata.domain;
  }
  if (typeof metadata.title === 'string') {
    mx.title = metadata.title;
  }
  if (typeof metadata.description === 'string') {
    mx.description = metadata.description;
  }
  if (typeof metadata.tokest === 'number') {
    mx.tokest = metadata.tokest;
  }
  if (typeof metadata.tokens === 'number') {
    mx.tokens = metadata.tokens;
  }
  if (metadata.fm !== undefined) {
    mx.fm = metadata.fm;
  }
  if (metadata.json !== undefined) {
    mx.json = metadata.json;
  }
  if (typeof metadata.length === 'number') {
    mx.length = metadata.length;
  }
}
