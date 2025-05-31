import { describe, it, expect, beforeEach, vi } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

// Mock fetch for URL tests
global.fetch = vi.fn();

describe('URL Cache Integration', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    vi.clearAllMocks();
  });

  it('should cache URL content based on TTL from @path directive', async () => {
    // Mock fetch response
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Remote Content\n\nThis content is from a remote URL.')
    } as Response);

    const mlldContent = `
@path (30m) trust always template = "https://example.com/template.md"

First use:
@add @template

Second use:
@add @template
`;

    const urlConfig = {
      enabled: true,
      allowedProtocols: ['https'],
      allowedDomains: [],
      blockedDomains: [],
      timeout: 30000,
      maxResponseSize: 10485760,
      cache: {
        enabled: false,
        ttl: 0,
        maxEntries: 0,
        rules: []
      }
    };

    // First interpretation - should fetch from network
    const result1 = await interpret(mlldContent, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig
    });

    expect(result1).toContain('# Remote Content');
    expect(result1).toContain('This content is from a remote URL.');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://example.com/template.md');

    // Reset fetch mock
    vi.clearAllMocks();

    // Mock a different response for second call (to prove cache is working)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Different Content\n\nThis should not appear if cache works.')
    } as Response);

    // Second interpretation - should use cache (within 30m TTL)
    const result2 = await interpret(mlldContent, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig
    });

    // Should still have the original content, not the new mocked content
    expect(result2).toContain('# Remote Content');
    expect(result2).not.toContain('# Different Content');
    
    // Fetch should not have been called again due to cache
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should respect trust level restrictions', async () => {
    const mlldContent = `
@path (5m) trust verify template = "http://insecure.example.com/template.md"

@add @template
`;

    const urlConfig = {
      enabled: true,
      allowedProtocols: ['https'],
      allowedDomains: [],
      blockedDomains: [],
      timeout: 30000,
      maxResponseSize: 10485760,
      cache: {
        enabled: false,
        ttl: 0,
        maxEntries: 0,
        rules: []
      }
    };

    // Should reject insecure URL with trust verify
    await expect(
      interpret(mlldContent, {
        fileSystem,
        pathService,
        format: 'markdown',
        basePath: '/',
        urlConfig
      })
    ).rejects.toThrow(/Insecure URL not allowed/);
  });

  it('should handle live TTL (always fetch fresh)', async () => {
    let callCount = 0;
    vi.mocked(fetch).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(`# Content ${callCount}\n\nThis is call number ${callCount}.`)
      } as Response);
    });

    const mlldContent = `
@path (live) trust always template = "https://example.com/live.md"

@add @template
@add @template
`;

    const urlConfig = {
      enabled: true,
      allowedProtocols: ['https'],
      allowedDomains: [],
      blockedDomains: [],
      timeout: 30000,
      maxResponseSize: 10485760,
      cache: {
        enabled: false,
        ttl: 0,
        maxEntries: 0,
        rules: []
      }
    };

    const result = await interpret(mlldContent, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig
    });

    // Should contain content from both calls since TTL is live
    expect(result).toContain('# Content 1');
    expect(result).toContain('# Content 2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should handle static TTL (cache indefinitely)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Static Content\n\nThis content should be cached forever.')
    } as Response);

    const mlldContent = `
@path (static) trust always template = "https://example.com/static.md"

@add @template
`;

    const urlConfig = {
      enabled: true,
      allowedProtocols: ['https'],
      allowedDomains: [],
      blockedDomains: [],
      timeout: 30000,
      maxResponseSize: 10485760,
      cache: {
        enabled: false,
        ttl: 0,
        maxEntries: 0,
        rules: []
      }
    };

    // First interpretation
    const result1 = await interpret(mlldContent, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig
    });

    expect(result1).toContain('# Static Content');
    expect(fetch).toHaveBeenCalledTimes(1);

    // Reset and change mock response
    vi.clearAllMocks();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# New Content\n\nThis should not appear.')
    } as Response);

    // Second interpretation - should use cache even with different mock
    const result2 = await interpret(mlldContent, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig
    });

    expect(result2).toContain('# Static Content');
    expect(result2).not.toContain('# New Content');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should work with @add directive security options', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Direct Add Content\n\nThis is added directly.')
    } as Response);

    const mlldContent = `
@add (10m) trust always "https://example.com/direct.md"
@add (10m) trust always "https://example.com/direct.md"
`;

    const urlConfig = {
      enabled: true,
      allowedProtocols: ['https'],
      allowedDomains: [],
      blockedDomains: [],
      timeout: 30000,
      maxResponseSize: 10485760,
      cache: {
        enabled: false,
        ttl: 0,
        maxEntries: 0,
        rules: []
      }
    };

    const result = await interpret(mlldContent, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig
    });

    expect(result).toContain('# Direct Add Content');
    // Should only fetch once due to caching
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});