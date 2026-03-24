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
              files: ['index.mld', 'README.md'],
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
    expect(info.docsUrl).toBe('https://example.com/modules/demo/README.md');
  });

  it('falls back to the entry point when a directory module has no README', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: {
          '@alice/demo': {
            name: 'demo',
            author: 'alice',
            about: 'Directory module without README',
            version: '1.0.0',
            needs: [],
            keywords: ['demo'],
            license: 'MIT',
            repo: 'https://github.com/alice/demo',
            source: {
              type: 'directory',
              baseUrl: 'https://example.com/modules/demo',
              files: ['index.mld', 'manifest.json'],
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
    expect(info.docsUrl).toBe('https://example.com/modules/demo/index.mld');
  });

  it('keeps the source and docs URLs for single-file modules', async () => {
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
    expect(info.docsUrl).toBe('https://example.com/modules/demo.mld');
  });
});
