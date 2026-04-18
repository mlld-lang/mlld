import { describe, expect, it, vi } from 'vitest';
import { attachToolCollectionMetadata } from '@core/types/tools';
import {
  extractUrlsFromText,
  extractUrlsFromValue,
  isUrlAllowedByConstruction,
  normalizeExtractedUrl
} from './url-provenance';

describe('url provenance utilities', () => {
  it('normalizes extracted URLs and removes fragments/default ports', () => {
    expect(normalizeExtractedUrl('HTTPS://Example.com:443/a/../b#frag')).toBe(
      'https://example.com/b'
    );
    expect(normalizeExtractedUrl('http://example.com:80')).toBe('http://example.com/');
  });

  it('extracts URLs from prose and trims trailing punctuation', () => {
    expect(
      extractUrlsFromText(
        'See https://example.com/path#frag, then visit (https://www.google.com/search?q=ada).'
      )
    ).toEqual([
      'https://example.com/path',
      'https://www.google.com/search?q=ada'
    ]);
  });

  it('extracts URLs recursively from nested values without reading metadata sidecars', () => {
    const value = {
      body: 'look at https://example.com/a',
      nested: [
        { text: 'and https://docs.example.com/b' },
        {
          metadata: {
            security: {
              urls: ['https://evil.com/bootstrap']
            }
          }
        }
      ]
    };

    expect(extractUrlsFromValue(value)).toEqual([
      'https://example.com/a',
      'https://docs.example.com/b'
    ]);
  });

  it('does not invoke object getters while scanning for URLs', () => {
    let getterReads = 0;
    const value = {
      body: 'look at https://example.com/a'
    } as Record<string, unknown>;

    Object.defineProperty(value, 'lazy', {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error('getter should not run during URL extraction');
      }
    });

    expect(extractUrlsFromValue(value)).toEqual([
      'https://example.com/a'
    ]);
    expect(getterReads).toBe(0);
  });

  it('skips executable definitions and tool collections while scanning nested values', () => {
    const toolCollection = attachToolCollectionMetadata({
      build: {
        mlld: {
          type: 'code',
          sourceDirective: 'exec',
          language: 'js',
          paramNames: ['payload'],
          codeTemplate: [
            { type: 'Text', content: 'curl https://internal.example.com/private' }
          ]
        }
      }
    }, {});
    const value = {
      body: 'look at https://example.com/a',
      tool: {
        type: 'code',
        sourceDirective: 'exec',
        language: 'js',
        paramNames: ['payload'],
        codeTemplate: [
          { type: 'Text', content: 'curl https://hidden.example.com/trace' }
        ]
      },
      tools: toolCollection
    };

    expect(extractUrlsFromValue(value)).toEqual([
      'https://example.com/a'
    ]);
  });

  it('does not descriptor-walk large executable ASTs while scanning nested values', () => {
    const descriptorSpy = vi.spyOn(Object, 'getOwnPropertyDescriptors');
    const toolCollection = attachToolCollectionMetadata({
      build: {
        mlld: {
          type: 'code',
          sourceDirective: 'exec',
          language: 'js',
          paramNames: ['payload'],
          codeTemplate: Array.from({ length: 2_000 }, (_, index) => ({
            type: 'Text',
            content: `curl https://hidden.example.com/trace/${index}`
          }))
        },
        description: 'visible docs https://example.com/docs'
      }
    }, {});
    const value = {
      body: 'look at https://example.com/a',
      tools: toolCollection
    };

    try {
      expect(extractUrlsFromValue(value)).toEqual([
        'https://example.com/a',
        'https://example.com/docs'
      ]);
      expect(descriptorSpy.mock.calls.length).toBeLessThan(10);
    } finally {
      descriptorSpy.mockRestore();
    }
  });

  it('matches exact-domain and wildcard construction allowlists', () => {
    expect(
      isUrlAllowedByConstruction('https://www.google.com/search?q=ada', ['google.com'])
    ).toBe(true);
    expect(
      isUrlAllowedByConstruction('https://api.internal.corp/v1', ['*.internal.corp'])
    ).toBe(true);
    expect(
      isUrlAllowedByConstruction('https://evil.com/collect', ['google.com', '*.internal.corp'])
    ).toBe(false);
  });
});
