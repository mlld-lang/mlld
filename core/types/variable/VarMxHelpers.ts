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
import type { DataLabel, SecurityDescriptor, ToolProvenance } from '@core/types/security';

const EMPTY_LABELS: readonly DataLabel[] = Object.freeze([]);
const EMPTY_SOURCES: readonly string[] = Object.freeze([]);
const EMPTY_URLS: readonly string[] = Object.freeze([]);
const EMPTY_TOOLS: readonly ToolProvenance[] = Object.freeze([]);

interface VarMxDescriptorCacheEntry {
  labels?: readonly DataLabel[];
  taint?: readonly DataLabel[];
  attestations?: readonly DataLabel[];
  sources?: readonly string[];
  urls?: readonly string[];
  tools?: readonly ToolProvenance[];
  policy?: Readonly<Record<string, unknown>> | null;
  descriptor: SecurityDescriptor;
}

const VAR_MX_DESCRIPTOR_CACHE = new WeakMap<VariableContext, VarMxDescriptorCacheEntry>();

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
  const canCache = Boolean(mx && typeof mx === 'object');
  if (canCache) {
    const cached = VAR_MX_DESCRIPTOR_CACHE.get(mx);
    if (
      cached &&
      cached.labels === mx.labels &&
      cached.taint === mx.taint &&
      cached.attestations === mx.attestations &&
      cached.sources === mx.sources &&
      cached.urls === mx.urls &&
      cached.tools === mx.tools &&
      cached.policy === mx.policy
    ) {
      return cached.descriptor;
    }
  }

  const descriptor = makeSecurityDescriptor({
    labels: mx.labels ?? EMPTY_LABELS,
    taint: mx.taint ?? EMPTY_LABELS,
    attestations: mx.attestations ?? EMPTY_LABELS,
    sources: mx.sources ?? EMPTY_SOURCES,
    urls: mx.urls ?? EMPTY_URLS,
    tools: mx.tools ?? EMPTY_TOOLS,
    policyContext: mx.policy ?? undefined
  });
  if (canCache) {
    VAR_MX_DESCRIPTOR_CACHE.set(mx, {
      labels: mx.labels,
      taint: mx.taint,
      attestations: mx.attestations,
      sources: mx.sources,
      urls: mx.urls,
      tools: mx.tools,
      policy: mx.policy,
      descriptor
    });
  }
  return descriptor;
}

export function legacyMetadataToVarMx(metadata?: VariableMetadata): VariableContext {
  const descriptor =
    normalizeSecurityDescriptor(metadata?.security as SecurityDescriptor | undefined) ??
    makeSecurityDescriptor();
  const metrics = metadata?.metrics;
  const loadResult = metadata?.loadResult as (LoadContentResult & Partial<LegacyLoadResult>) | undefined;

  const mx: VariableContext = {
    labels: descriptor.labels ?? EMPTY_LABELS,
    taint: descriptor.taint ?? EMPTY_LABELS,
    attestations: descriptor.attestations ?? EMPTY_LABELS,
    schema: metadata?.schema,
    factsources: Array.isArray((metadata as { factsources?: readonly unknown[] } | undefined)?.factsources)
      ? cloneArray((metadata as { factsources?: readonly unknown[] }).factsources as readonly any[])
      : undefined,
    sources: descriptor.sources ?? EMPTY_SOURCES,
    urls: descriptor.urls ?? EMPTY_URLS,
    tools: descriptor.tools ?? EMPTY_TOOLS,
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
  VAR_MX_DESCRIPTOR_CACHE.delete(mx);
  const normalized = normalizeSecurityDescriptor(descriptor) ?? makeSecurityDescriptor();
  mx.labels = normalized.labels;
  mx.taint = normalized.taint;
  mx.attestations = normalized.attestations;
  mx.sources = normalized.sources;
  mx.urls = normalized.urls ?? (mx.urls ?? EMPTY_URLS);
  mx.tools = normalized.tools ?? EMPTY_TOOLS;
  mx.policy = normalized.policyContext ?? null;
}

export function hasSecurityVarMx(mx: VariableContext): boolean {
  return (
    (mx.labels?.length ?? 0) > 0
    || (mx.taint?.length ?? 0) > 0
    || (mx.attestations?.length ?? 0) > 0
    || (mx.urls?.length ?? 0) > 0
    || (mx.tools?.length ?? 0) > 0
  );
}

export function serializeSecurityVarMx(
  mx: VariableContext
): {
  labels: readonly DataLabel[];
  taint: readonly DataLabel[];
  attestations: readonly DataLabel[];
  sources: readonly string[];
  urls: readonly string[];
  tools: readonly ToolProvenance[];
  policy: Readonly<Record<string, unknown>> | null;
} {
  return {
    labels: mx.labels ?? EMPTY_LABELS,
    taint: mx.taint ?? [],
    attestations: mx.attestations ?? EMPTY_LABELS,
    sources: mx.sources ?? EMPTY_SOURCES,
    urls: mx.urls ?? EMPTY_URLS,
    tools: mx.tools ?? EMPTY_TOOLS,
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
