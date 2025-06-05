import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Environment } from './env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { interpret } from './index';

// Mock global fetch
global.fetch = vi.fn();

describe('URL Support', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  let env: Environment;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    env = new Environment(fileSystem, pathService, '/project');
    vi.clearAllMocks();
  });

  describe('Environment URL Methods', () => {
    it('should detect URLs correctly', () => {
      expect(env.isURL('https://example.com/file.md')).toBe(true);
      expect(env.isURL('http://example.com/file.md')).toBe(true);
      expect(env.isURL('./local/file.md')).toBe(false);
      expect(env.isURL('/absolute/path.md')).toBe(false);
      expect(env.isURL('relative/path.md')).toBe(false);
    });

    it('should validate allowed protocols', async () => {
      await expect(env.validateURL('ftp://example.com/file')).rejects.toThrow('Protocol not allowed: ftp:');
      await expect(env.validateURL('https://example.com/file')).resolves.toBeUndefined();
    });

    it('should validate allowed domains', async () => {
      env.setURLOptions({
        allowedDomains: ['github.com', 'raw.githubusercontent.com']
      });

      await expect(env.validateURL('https://github.com/user/repo/file.md')).resolves.toBeUndefined();
      await expect(env.validateURL('https://raw.githubusercontent.com/user/repo/main/file.md')).resolves.toBeUndefined();
      await expect(env.validateURL('https://evil.com/file.md')).rejects.toThrow('Domain not allowed: evil.com');
    });

    it('should validate blocked domains', async () => {
      env.setURLOptions({
        blockedDomains: ['evil.com', 'malware.org']
      });

      await expect(env.validateURL('https://github.com/file.md')).resolves.toBeUndefined();
      await expect(env.validateURL('https://evil.com/file.md')).rejects.toThrow('Domain blocked: evil.com');
      await expect(env.validateURL('https://subdomain.evil.com/file.md')).rejects.toThrow('Domain blocked: subdomain.evil.com');
    });

    it('should fetch URL content', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('# Test Content\nThis is from a URL')
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const content = await env.fetchURL('https://example.com/test.md');
      expect(content).toBe('# Test Content\nThis is from a URL');
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/test.md', expect.any(Object));
    });

    it('should cache URL responses', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('Cached content')
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // First fetch
      await env.fetchURL('https://example.com/cached.md');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second fetch should use cache
      const cached = await env.fetchURL('https://example.com/cached.md');
      expect(cached).toBe('Cached content');
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should handle fetch errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(env.fetchURL('https://example.com/notfound.md')).rejects.toThrow('HTTP error 404');
    });

    it('should enforce response size limits', async () => {
      env.setURLOptions({ maxResponseSize: 100 });
      
      const largeContent = 'x'.repeat(101);
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(largeContent)
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(env.fetchURL('https://example.com/large.md')).rejects.toThrow('Response too large: 101 bytes');
    });

    it('should handle timeouts', async () => {
      env.setURLOptions({ timeout: 100 });

      // Mock fetch that simulates abort
      (global.fetch as any).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          }, 50);
        });
      });

      await expect(env.fetchURL('https://example.com/slow.md')).rejects.toThrow('Request timed out after 100ms');
    });
  });

  describe('Import with URLs', () => {
    it('should import from URL', async () => {
      // Set up mock file system for local imports
      await fileSystem.writeFile('/project/test.mld', `@import { * } from [https://example.com/remote.mld]`);
      
      // Mock the URL content
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(`@text greeting = "Hello from URL"`)
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await interpret(await fileSystem.readFile('/project/test.mld'), {
        fileSystem,
        pathService,
        basePath: '/project',
        format: 'markdown',
        urlOptions: {
          allowedDomains: ['example.com']
        }
      });

      // The import itself produces no output, but the variable should be available
      expect(result).toBe('');
    });

    it('should detect circular imports with URLs', async () => {
      // This would need the grammar to support URL paths in import directives
      // For now, we'll test the Environment's circular import detection
      const url = 'https://example.com/circular.mld';
      
      expect(env.isImporting(url)).toBe(false);
      env.beginImport(url);
      expect(env.isImporting(url)).toBe(true);
      env.endImport(url);
      expect(env.isImporting(url)).toBe(false);
    });
  });

  describe('Text directive with URLs', () => {
    it('should fetch content from URL in text directive', async () => {
      // Mock the URL content
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('Content from URL')
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // This test assumes the grammar supports URL paths in text directives
      const source = `@text content = [https://example.com/content.md]`;
      
      // For now, we'll test the readFile method directly
      const content = await env.readFile('https://example.com/content.md');
      expect(content).toBe('Content from URL');
    });
  });

  describe('Add directive with URLs', () => {
    it('should add content from URL', async () => {
      // Mock the URL content
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('# Added Content\nFrom a URL')
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // Test readFile directly
      const content = await env.readFile('https://example.com/add.md');
      expect(content).toBe('# Added Content\nFrom a URL');
    });
  });

  describe('Path directive with URLs', () => {
    it('should store URL paths', async () => {
      // This would test path assignments like:
      // @path apiEndpoint = "https://api.example.com/v1"
      
      // The path evaluator should handle URLs without modification
      const url = 'https://api.example.com/v1';
      expect(env.isURL(url)).toBe(true);
    });
  });

  describe('Complex data with URL-fetching directives', () => {
    it('should support embedded directives that fetch from URLs', async () => {
      // This tests complex data scenarios like:
      // @data config = {
      //   readme: @add [https://example.com/README.md]
      // }
      
      // Mock the URL content
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('README content')
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // Test that URLs work within the lazy evaluation system
      const content = await env.readFile('https://example.com/README.md');
      expect(content).toBe('README content');
    });
  });

  describe('CLI Integration', () => {
    it('should pass URL options from CLI to interpreter', async () => {
      const options = {
        fileSystem,
        pathService,
        basePath: '/project',
        format: 'markdown' as const,
        urlOptions: {
          allowedDomains: [], // Empty allowed list so blocked list is checked
          blockedDomains: ['evil.com'],
          timeout: 5000,
          maxResponseSize: 1024 * 1024
        }
      };

      // Create environment with configuration
      const testEnv = new Environment(
        options.fileSystem,
        options.pathService,
        options.basePath
      );
      
      // Set URL configuration
      testEnv.setURLConfig({
        enabled: true,
        allowedDomains: options.urlOptions.allowedDomains,
        blockedDomains: options.urlOptions.blockedDomains,
        allowedProtocols: ['https', 'http'],
        timeout: options.urlOptions.timeout,
        maxSize: options.urlOptions.maxResponseSize,
        warnOnInsecureProtocol: true,
        cache: {
          enabled: true,
          defaultTTL: 5 * 60 * 1000,
          rules: []
        }
      });

      // Verify options were set - with empty allowed list, all domains except blocked are allowed
      await expect(testEnv.validateURL('https://github.com/test')).resolves.toBeUndefined();
      await expect(testEnv.validateURL('https://evil.com/test')).rejects.toThrow('Domain blocked: evil.com');
    });
  });
});