import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getModuleInfo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a source URL for directory modules', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: {
          '@alice/demo': {
            name: 'demo',
            author: 'alice',
            about: 'Directory module',
            version: '1.0.0',
            needs: [],
            keywords: ['demo'],
            license: 'MIT',
            repo: 'https://github.com/alice/demo',
            source: {
              type: 'directory',
              baseUrl: 'https://example.com/modules/demo',
              files: ['index.mld'],
              entryPoint: 'index.mld',
              contentHash: 'abc123'
            },
            publishedAt: '2026-03-01T00:00:00.000Z'
          }
        }
      })
    }) as any);

    const { getModuleInfo } = await import('./info');
    const info = await getModuleInfo('@alice/demo');

    expect(info.sourceUrl).toBe('https://example.com/modules/demo/index.mld');
  });

  it('keeps the source URL for single-file modules', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: {
          '@alice/demo': {
            name: 'demo',
            author: 'alice',
            about: 'Single file module',
            version: '1.0.0',
            needs: [],
            keywords: ['demo'],
            license: 'MIT',
            repo: 'https://github.com/alice/demo',
            source: {
              type: 'github',
              url: 'https://example.com/modules/demo.mld',
              contentHash: 'abc123'
            },
            publishedAt: '2026-03-01T00:00:00.000Z'
          }
        }
      })
    }) as any);

    const { getModuleInfo } = await import('./info');
    const info = await getModuleInfo('@alice/demo');

    expect(info.sourceUrl).toBe('https://example.com/modules/demo.mld');
  });
});
