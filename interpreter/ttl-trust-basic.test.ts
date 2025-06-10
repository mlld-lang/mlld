import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('TTL/Trust Basic Functionality', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    
    // Enable test mode to prevent lock file operations
    process.env.MLLD_TEST_MODE = 'true';
    
    // Create test project directory in MemoryFileSystem
    await fileSystem.mkdir('/test-project', { recursive: true });
    
    // Mock fetch for URL tests
    global.fetch = vi.fn();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MLLD_TEST_MODE;
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
      basePath: process.cwd(),
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
    // Mock SecurityManager to allow the command
    const mockCheckCommand = vi.fn().mockResolvedValue({
      allowed: true,
      requiresApproval: false
    });
    
    const mockSecurity = {
      checkCommand: mockCheckCommand,
      trackTaint: vi.fn(),
      getTaint: vi.fn()
    };
    
    const { SecurityManager } = await import('@security');
    vi.spyOn(SecurityManager, 'getInstance').mockReturnValue(mockSecurity as any);
    
    const input = `
# Trust on Run Test

@run trust always [(echo "Always trusted command")]
`;
    
    const result = await interpret(input, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: process.cwd()
    });
    
    expect(result).toContain('Always trusted command');
    
    // Verify security check was called with trust metadata
    expect(mockCheckCommand).toHaveBeenCalledWith(
      'echo "Always trusted command"',
      expect.objectContaining({
        metadata: expect.objectContaining({
          trust: 'always'
        })
      })
    );
  });
  
  it.skip('should parse combined TTL and trust options', async () => {
    // TODO: Issue #228 - Fix MemoryFileSystem @add operations in tests
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
      basePath: process.cwd()
    });
    
    expect(result).toContain('Safe content');
  });
  
  it.skip('should handle special TTL values', async () => {
    // TODO: Issue #228 - Fix MemoryFileSystem @add operations in tests
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
      basePath: process.cwd()
    });
    
    expect(result).toContain('Static content');
  });
});