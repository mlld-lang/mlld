import type { VariableContext } from './VariableTypes';
import type { LoadContentResult } from '@core/types/load-content';
import {
  makeSecurityDescriptor,
  normalizeSecurityDescriptor
} from '@core/types/security';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';

const EMPTY_LABELS: readonly DataLabel[] = Object.freeze([]);
const EMPTY_SOURCES: readonly string[] = Object.freeze([]);

interface LoadResultWithExtras extends Partial<LoadContentResult> {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
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
