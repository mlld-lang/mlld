import { describe, it, expect, beforeEach, vi } from 'vitest';
import { URLCache } from './cache/URLCache';

// Mock fetch
global.fetch = vi.fn();

describe('URLCache Local Path Detection', () => {
  let urlCache: URLCache;
  let mockCache: any;
  let mockLockFile: any;

  beforeEach(() => {
    // Create mock cache
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
    };

    // Create mock lock file
    mockLockFile = {
      data: { cache: { urls: {} } },
      save: vi.fn(),
    };

    urlCache = new URLCache(mockCache, mockLockFile);

    // Mock cache methods
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('mock-hash-123');
    
    // Mock lock file methods
    mockLockFile.save.mockResolvedValue(undefined);

    // Mock global fetch
    vi.mocked(fetch).mockImplementation(async (url: string) => {
      // Block localhost and loopback addresses first
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        throw new Error('Fetch should not be called for local paths');
      }
      
      // Allow other HTTPS and HTTP URLs
      if (url.startsWith('https://') || url.startsWith('http://')) {
        return {
          ok: true,
          text: async () => 'Remote content from ' + url
        };
      }
      
      throw new Error('Fetch should not be called for local paths');
    });

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('Local Path Detection', () => {
    it('should detect relative paths as local', async () => {
      const localPaths = [
        './config.mld',
        '../utils.mld',
        'lib/helpers.mld'
      ];

      for (const localPath of localPaths) {
        // For local paths, URLCache should bypass caching and then fail when trying to fetch
        // This proves that caching is bypassed for local paths
        await expect(urlCache.fetchURL(localPath)).rejects.toThrow('URLCache should not be used for local file paths');
      }

      // Verify no cache entries were created for local paths
      expect(mockCache.set).not.toHaveBeenCalled();
      expect(mockLockFile.save).not.toHaveBeenCalled();
    });

    it('should detect absolute paths as local', async () => {
      const localPaths = [
        '/home/user/config.mld',
        '/Users/alice/projects/utils.mld',
        '/var/lib/data.mld'
      ];

      for (const localPath of localPaths) {
        await expect(urlCache.fetchURL(localPath)).rejects.toThrow('URLCache should not be used for local file paths');
      }

      // Verify no cache entries were created
      expect(mockCache.set).not.toHaveBeenCalled();
      expect(mockLockFile.save).not.toHaveBeenCalled();
    });

    it('should detect home directory paths as local', async () => {
      const localPaths = [
        '~/documents/config.mld',
        '~/projects/utils.mld'
      ];

      for (const localPath of localPaths) {
        await expect(urlCache.fetchURL(localPath)).rejects.toThrow('URLCache should not be used for local file paths');
      }

      expect(mockCache.set).not.toHaveBeenCalled();
      expect(mockLockFile.save).not.toHaveBeenCalled();
    });

    it('should detect file:// URLs as local', async () => {
      const localPaths = [
        'file:///home/user/config.mld',
        'file://localhost/Users/alice/utils.mld'
      ];

      for (const localPath of localPaths) {
        await expect(urlCache.fetchURL(localPath)).rejects.toThrow('URLCache should not be used for local file paths');
      }

      expect(mockCache.set).not.toHaveBeenCalled();
      expect(mockLockFile.save).not.toHaveBeenCalled();
    });

    it('should detect localhost URLs as local', async () => {
      const localPaths = [
        'http://localhost:3000/api/data',
        'https://localhost:8080/config',
        'http://127.0.0.1:3000/api',
        'https://127.0.0.1:8080/config'
      ];

      for (const localPath of localPaths) {
        // Localhost URLs are detected by shouldCache() but fail in fetchFresh() with our mock
        await expect(urlCache.fetchURL(localPath)).rejects.toThrow('Fetch should not be called for local paths');
      }

      expect(mockCache.set).not.toHaveBeenCalled();
      expect(mockLockFile.save).not.toHaveBeenCalled();
    });
  });

  describe('Remote URL Caching', () => {
    it('should cache remote HTTPS URLs', async () => {
      const remoteUrls = [
        'https://api.example.com/data.json',
        'https://docs.company.com/guide.md',
        'https://raw.githubusercontent.com/user/repo/main/config.mld'
      ];

      for (const remoteUrl of remoteUrls) {
        const result = await urlCache.fetchURL(remoteUrl);
        expect(result).toBe('Remote content from ' + remoteUrl);
      }

      // Verify cache operations were called for each remote URL
      expect(mockCache.set).toHaveBeenCalledTimes(remoteUrls.length);
      expect(mockLockFile.save).toHaveBeenCalledTimes(remoteUrls.length);
    });

    it('should cache remote HTTP URLs', async () => {
      // Mock fetch to allow HTTP for this test
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
          return {
            ok: true,
            text: async () => 'Remote content from ' + url
          };
        }
        throw new Error('Unexpected URL in test');
      });

      const remoteUrl = 'http://api.example.com/data.json';
      
      // Use trust=always to allow HTTP URLs
      const result = await urlCache.fetchURL(remoteUrl, { trust: 'always' });
      expect(result).toBe('Remote content from ' + remoteUrl);

      // Verify cache operations were called
      expect(mockCache.set).toHaveBeenCalledTimes(1);
      expect(mockLockFile.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle URLs that look like local paths but are actually remote', async () => {
      const edgeCaseUrls = [
        'https://example.com/./relative-looking',
        'https://example.com/../parent-looking',
        'https://example.com/~user/home-looking'
      ];

      for (const url of edgeCaseUrls) {
        const result = await urlCache.fetchURL(url);
        expect(result).toBe('Remote content from ' + url);
      }

      // These should be cached as they are legitimate remote URLs
      expect(mockCache.set).toHaveBeenCalledTimes(edgeCaseUrls.length);
      expect(mockLockFile.save).toHaveBeenCalledTimes(edgeCaseUrls.length);
    });

    it('should handle mixed local and remote URLs correctly', async () => {
      const mixedUrls = [
        { url: './local.mld', shouldCache: false },
        { url: 'https://remote.com/data.json', shouldCache: true },
        { url: '/absolute/local.mld', shouldCache: false },
        { url: 'https://api.example.com/config', shouldCache: true },
        { url: 'http://localhost:3000/api', shouldCache: false }
      ];

      let successCount = 0;
      let errorCount = 0;

      for (const { url, shouldCache } of mixedUrls) {
        try {
          const result = await urlCache.fetchURL(url);
          if (shouldCache) {
            expect(result).toBe('Remote content from ' + url);
            successCount++;
          } else {
            throw new Error('Should not succeed for local paths');
          }
        } catch (error) {
          if (!shouldCache) {
            // Different error messages for different types of local content
            const errorMessage = error.message;
            const isExpectedLocalError = 
              errorMessage.includes('URLCache should not be used for local file paths') ||
              errorMessage.includes('Fetch should not be called for local paths');
            expect(isExpectedLocalError).toBe(true);
            errorCount++;
          } else {
            throw error;
          }
        }
      }

      // Verify only remote URLs were cached
      const remoteCacheableUrls = mixedUrls.filter(u => u.shouldCache);
      expect(mockCache.set).toHaveBeenCalledTimes(remoteCacheableUrls.length);
      expect(mockLockFile.save).toHaveBeenCalledTimes(remoteCacheableUrls.length);
      expect(successCount).toBe(remoteCacheableUrls.length);
      expect(errorCount).toBe(mixedUrls.length - remoteCacheableUrls.length);
    });
  });
});