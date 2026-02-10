import { describe, it, expect } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import { wrapStructured, isStructuredValue } from '@interpreter/utils/structured-value';
import { LoadContentResultImpl } from '../load-content';
import { ContentLoaderFinalizationAdapter } from './finalization-adapter';

describe('ContentLoaderFinalizationAdapter', () => {
  const adapter = new ContentLoaderFinalizationAdapter();

  it('keeps string finalization shape stable', () => {
    const result = adapter.finalizeLoaderResult('plain text');
    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.type).toBe('text');
      expect(result.data).toBe('plain text');
      expect(result.text).toBe('plain text');
      expect(result.metadata?.source).toBe('load-content');
    }
  });

  it('keeps array finalization shape stable', () => {
    const result = adapter.finalizeLoaderResult(['alpha', 'beta']);
    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.type).toBe('array');
      expect(result.data).toEqual(['alpha', 'beta']);
      expect(result.text).toBe('alpha\n\nbeta');
      expect(result.metadata?.source).toBe('load-content');
    }
  });

  it('keeps LoadContentResult finalization shape stable', () => {
    const loadResult = new LoadContentResultImpl({
      content: '{"ok":true}',
      filename: 'data.json',
      relative: './data.json',
      absolute: '/project/data.json'
    });

    const result = adapter.finalizeLoaderResult(loadResult);
    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.type).toBe('object');
      expect(result.data).toEqual({ ok: true });
      expect(result.text).toBe('{"ok":true}');
      expect(result.metadata?.filename).toBe('data.json');
      expect(result.metadata?.source).toBe('load-content');
    }
  });

  it('keeps metadata merge behavior stable when structured values carry security descriptors', () => {
    const base = wrapStructured('secured', 'text', 'secured', {
      source: 'pipeline',
      security: makeSecurityDescriptor({
        labels: ['base'],
        sources: ['source:base']
      })
    });

    const result = adapter.finalizeLoaderResult(base, {
      metadata: {
        filename: 'merged.txt',
        security: makeSecurityDescriptor({
          labels: ['extra'],
          sources: ['source:extra']
        })
      }
    });

    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.type).toBe('text');
      expect(result.data).toBe('secured');
      expect(result.metadata?.source).toBe('pipeline');
      expect(result.metadata?.filename).toBe('merged.txt');
      expect(result.metadata?.security?.labels).toEqual(expect.arrayContaining(['base', 'extra']));
      expect(result.metadata?.security?.sources).toEqual(expect.arrayContaining(['source:base', 'source:extra']));
    }
  });
});
