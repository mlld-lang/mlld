import { describe, it, expect } from 'vitest';
import {
  ctxToLoadResult,
  ctxToSecurityDescriptor,
  flattenLoadResultToCtx,
  hasSecurityContext,
  metadataToCtx,
  metadataToInternal,
  serializeSecurityContext,
  updateCtxFromDescriptor
} from './metadata-migration';
import type { VariableContext, VariableMetadata } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';

function createMetadata(): VariableMetadata {
  return {
    security: makeSecurityDescriptor({
      labels: ['secret'],
      taintLevel: 'llmOutput',
      sources: ['pipeline'],
      policyContext: { allow: false }
    }),
    filename: 'README.md',
    relative: './README.md',
    absolute: '/abs/README.md',
    tokest: 10,
    tokens: 11,
    fm: { title: 'Doc' },
    json: { data: true },
    retries: 2,
    source: 'test-source',
    metrics: {
      length: 100,
      tokest: 10,
      tokens: 11
    },
    isImported: true,
    arrayType: 'load-content-result'
  };
}

describe('metadata migration helpers', () => {
  it('converts metadata into ctx snapshot', () => {
    const ctx = metadataToCtx(createMetadata());

    expect(ctx.labels).toEqual(['secret']);
    expect(ctx.taint).toBe('llmOutput');
    expect(ctx.sources).toEqual(['pipeline']);
    expect(ctx.filename).toBe('README.md');
    expect(ctx.relative).toBe('./README.md');
    expect(ctx.absolute).toBe('/abs/README.md');
    expect(ctx.fm).toEqual({ title: 'Doc' });
    expect(ctx.json).toEqual({ data: true });
    expect(ctx.retries).toBe(2);
    expect(ctx.source).toBe('test-source');
    expect(ctx.exported).toBe(true);
  });

  it('strips security fields when building internal metadata', () => {
    const metadata = createMetadata();
    const internal = metadataToInternal(metadata);

    expect(internal.arrayType).toBe('load-content-result');
    expect(internal.security).toBeUndefined();
    expect(internal.metrics).toBeUndefined();
    expect(internal.source).toBeUndefined();
  });

  it('round-trips security descriptors through ctx helpers', () => {
    const ctx = metadataToCtx(createMetadata());
    const descriptor = ctxToSecurityDescriptor(ctx);
    updateCtxFromDescriptor(ctx, makeSecurityDescriptor({ labels: ['public'] }));

    expect(descriptor.labels).toEqual(['secret']);
    expect(ctx.labels).toEqual(['public']);
    expect(hasSecurityContext(ctx)).toBe(true);
    expect(serializeSecurityContext(ctx).taint).toBe('unknown');
  });

  it('flattens load results into ctx and reconstructs them later', () => {
    const ctx: VariableContext = {
      labels: [],
      taint: 'unknown',
      sources: [],
      policy: null
    };

    flattenLoadResultToCtx(ctx, {
      content: 'ignored',
      filename: 'file.md',
      relative: './file.md',
      absolute: '/abs/file.md',
      tokest: 5,
      tokens: 6,
      fm: { title: 'hi' },
      json: { ok: true },
      url: 'https://example.com',
      domain: 'example.com'
    });

    expect(ctx.filename).toBe('file.md');
    expect(ctx.url).toBe('https://example.com');

    const loadResult = ctxToLoadResult(ctx);
    expect(loadResult).not.toBeNull();
    expect(loadResult?.filename).toBe('file.md');
    expect(loadResult?.tokest).toBe(5);
  });

  it('returns null load result when ctx lacks file metadata', () => {
    const ctx: VariableContext = {
      labels: [],
      taint: 'unknown',
      sources: [],
      policy: null
    };

    expect(ctxToLoadResult(ctx)).toBeNull();
  });
});
