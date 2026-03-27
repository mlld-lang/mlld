import { describe, expect, it } from 'vitest';
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
