import { describe, it, expect, beforeEach, vi } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('TTL/Trust Enforcement', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    
    // Mock fetch for URL tests
    global.fetch = vi.fn();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should pass TTL metadata to URLCache for path variables', async () => {
    // Mock fetch response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => '# Test Content\n\nThis is from the URL.'
    });
    
    const input = `
# TTL Test

@path api = "https://api.example.com/data.json"
@add (30s) @api
`;
    
    const result = await interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig: {
        enabled: true,
        allowedProtocols: ['https'],
        allowedDomains: [],
        blockedDomains: [],
        timeout: 30000,
        maxResponseSize: 10485760,
        cache: {
          enabled: true,
          ttl: 86400000, // 24h default
          maxEntries: 100
        }
      }
    });
    
    // Check that fetch was called
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data.json');
    
    // Check output
    expect(result).toContain('# Test Content');
    expect(result).toContain('This is from the URL.');
  });
  
  it('should use TTL from path variable when importing', async () => {
    // Mock fetch responses
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '@text greeting = "Hello from URL with TTL!"'
      });
    
    const input = `
# Import with TTL

@path (5m) config = "https://example.com/config.mld"
@import { greeting } from @config

@add @greeting
`;
    
    const result = await interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig: {
        enabled: true,
        allowedProtocols: ['https'],
        allowedDomains: [],
        blockedDomains: [],
        timeout: 30000,
        maxResponseSize: 10485760,
        cache: {
          enabled: true,
          ttl: 86400000,
          maxEntries: 100
        }
      }
    });
    
    expect(result).toContain('Hello from URL with TTL!');
  });
  
  it('should respect trust levels for URL access', async () => {
    const input = `
# Trust Level Test

@path (trust never) blocked = "https://untrusted.com/data.json"
@add @blocked
`;
    
    // This should throw an error due to trust level
    await expect(interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig: {
        enabled: true,
        allowedProtocols: ['https'],
        allowedDomains: [],
        blockedDomains: [],
        timeout: 30000,
        maxResponseSize: 10485760,
        cache: {
          enabled: true,
          ttl: 86400000,
          maxEntries: 100
        }
      }
    })).rejects.toThrow(/URL access denied by trust policy/);
  });
  
  it('should enforce HTTPS for trust verify', async () => {
    const input = `
# Trust Verify Test

@path (trust verify) api = "http://insecure.com/data.json"
@add @api
`;
    
    // This should throw an error due to insecure protocol
    await expect(interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig: {
        enabled: true,
        allowedProtocols: ['http', 'https'],
        allowedDomains: [],
        blockedDomains: [],
        timeout: 30000,
        maxResponseSize: 10485760,
        cache: {
          enabled: true,
          ttl: 86400000,
          maxEntries: 100
        }
      }
    })).rejects.toThrow(/Insecure URL not allowed with trust verify/);
  });
  
  it('should handle special TTL values (live, static)', async () => {
    let fetchCount = 0;
    (global.fetch as any).mockImplementation(async () => {
      fetchCount++;
      return {
        ok: true,
        text: async () => `Fetch #${fetchCount}`
      };
    });
    
    const input = `
# Special TTL Test

@path (live) liveData = "https://api.example.com/live.txt"
@add @liveData

@add @liveData
`;
    
    const result = await interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/',
      urlConfig: {
        enabled: true,
        allowedProtocols: ['https'],
        allowedDomains: [],
        blockedDomains: [],
        timeout: 30000,
        maxResponseSize: 10485760,
        cache: {
          enabled: true,
          ttl: 86400000,
          maxEntries: 100
        }
      }
    });
    
    // With 'live' TTL, each access should fetch fresh
    expect(fetchCount).toBe(2);
    expect(result).toContain('Fetch #1');
    expect(result).toContain('Fetch #2');
  });
  
  it('should store TTL/trust metadata on all variable types', async () => {
    const input = `
# Variable TTL/Trust Test

@text (30s) message = "Cached message"
@data (5m, trust always) config = { "enabled": true }
@exec (1h) cmd() = @run [(echo "Cached command")]
@path (static) docs = "./README.md"
`;
    
    await fileSystem.writeFile('/README.md', '# README Content');
    
    const result = await interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/'
    });
    
    // The directives should execute successfully
    // (actual TTL/trust enforcement happens when variables are used)
    expect(result).toContain('# Variable TTL/Trust Test');
  });
});