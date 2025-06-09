import { describe, it, expect, beforeEach, vi } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('TTL/Trust Basic Functionality', () => {
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
  
  it('should apply TTL to @add directive with URL path', async () => {
    // Mock fetch response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => '# Test Content\n\nThis is from the URL with TTL.'
    });
    
    const input = `
# TTL on Add Test

@path api = "https://api.example.com/data.md"
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
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data.md');
    
    // Check output
    expect(result).toContain('# Test Content');
    expect(result).toContain('This is from the URL with TTL.');
  });
  
  it('should handle trust levels on @run directives', async () => {
    const input = `
# Trust on Run Test

@run trust always [(echo "Always trusted command")]
`;
    
    const result = await interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/'
    });
    
    expect(result).toContain('Always trusted command');
  });
  
  it('should parse combined TTL and trust options', async () => {
    // Create test files
    await fileSystem.writeFile('/safe.txt', 'Safe content');
    
    const input = `
# Combined Options Test

@path safePath = "./safe.txt"
@add (1h) trust always @safePath
`;
    
    const result = await interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/'
    });
    
    expect(result).toContain('Safe content');
  });
  
  it('should handle special TTL values', async () => {
    await fileSystem.writeFile('/static.txt', 'Static content');
    
    const input = `
# Special TTL Test

@path staticFile = "./static.txt"
@add (static) @staticFile
`;
    
    const result = await interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/'
    });
    
    expect(result).toContain('Static content');
  });
});