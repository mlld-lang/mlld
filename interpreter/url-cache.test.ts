import { describe, it, expect, beforeEach, vi } from 'vitest';
import { URLCache } from './cache/URLCache';
import type { TTLOption, SecurityOptions } from '@core/types/primitives';

// Mock fetch
global.fetch = vi.fn();

describe('URLCache', () => {
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

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('TTL conversion', () => {
    it('should convert duration TTL to seconds', () => {
      const ttl: TTLOption = {
        type: 'duration',
        value: 30,
        unit: 'minutes'
      };

      const seconds = (urlCache as any).getTTLSeconds(ttl);
      expect(seconds).toBe(1800); // 30 * 60
    });

    it('should handle special TTL values', () => {
      const liveTTL: TTLOption = {
        type: 'special',
        value: 0
      };

      const staticTTL: TTLOption = {
        type: 'special', 
        value: -1
      };

      expect((urlCache as any).getTTLSeconds(liveTTL)).toBe(0);
      expect((urlCache as any).getTTLSeconds(staticTTL)).toBe(Infinity);
    });

    it('should use default TTL for missing values', () => {
      const defaultTTL: TTLOption = {
        type: 'duration'
      };

      const seconds = (urlCache as any).getTTLSeconds(defaultTTL);
      expect(seconds).toBe(86400); // 24 hours default
    });
  });

  describe('trust level validation', () => {
    it('should reject URLs with trust never', async () => {
      await expect(
        (urlCache as any).checkTrust('https://example.com', 'never')
      ).rejects.toThrow('URL access denied by trust policy');
    });

    it('should reject insecure URLs with trust verify', async () => {
      await expect(
        (urlCache as any).checkTrust('http://example.com', 'verify')
      ).rejects.toThrow('Insecure URL not allowed with trust verify');
    });

    it('should allow HTTPS URLs with trust verify', async () => {
      await expect(
        (urlCache as any).checkTrust('https://example.com', 'verify')
      ).resolves.not.toThrow();
    });

    it('should allow any URL with trust always', async () => {
      await expect(
        (urlCache as any).checkTrust('http://example.com', 'always')
      ).resolves.not.toThrow();

      await expect(
        (urlCache as any).checkTrust('https://example.com', 'always')
      ).resolves.not.toThrow();
    });
  });

  describe('cache expiration', () => {
    it('should detect expired cache entries', () => {
      const expiredEntry = {
        url: 'https://example.com',
        hash: 'abc123',
        cachedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        ttl: { type: 'duration', value: 30, unit: 'minutes' } as TTLOption,
        trust: 'verify' as const,
        configuredBy: 'test',
        expiresAt: new Date(Date.now() - 1800000).toISOString() // 30 min ago
      };

      const currentTTL: TTLOption = {
        type: 'duration',
        value: 30,
        unit: 'minutes'
      };

      const isExpired = (urlCache as any).isCacheExpired(expiredEntry, currentTTL);
      expect(isExpired).toBe(true);
    });

    it('should not expire static cache entries', () => {
      const staticEntry = {
        url: 'https://example.com',
        hash: 'abc123',
        cachedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        ttl: { type: 'special', value: -1 } as TTLOption,
        trust: 'verify' as const,
        configuredBy: 'test',
        expiresAt: 'never'
      };

      const staticTTL: TTLOption = {
        type: 'special',
        value: -1
      };

      const isExpired = (urlCache as any).isCacheExpired(staticEntry, staticTTL);
      expect(isExpired).toBe(false);
    });

    it('should always expire live cache entries', () => {
      const liveEntry = {
        url: 'https://example.com',
        hash: 'abc123',
        cachedAt: new Date().toISOString(),
        ttl: { type: 'special', value: 0 } as TTLOption,
        trust: 'verify' as const,
        configuredBy: 'test',
        expiresAt: 'live'
      };

      const liveTTL: TTLOption = {
        type: 'special',
        value: 0
      };

      const isExpired = (urlCache as any).isCacheExpired(liveEntry, liveTTL);
      expect(isExpired).toBe(true);
    });
  });

  describe('URL fetching with security', () => {
    beforeEach(() => {
      // Mock cache methods
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue('abc123hash');
      
      // Mock lock file methods
      mockLockFile.data = { cache: { urls: {} } };
      mockLockFile.save.mockResolvedValue(undefined);

      // Mock fetch
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Test Content\n\nThis is test content from URL.')
      } as Response);
    });

    it('should fetch and cache URL with TTL', async () => {
      const security: SecurityOptions = {
        ttl: {
          type: 'duration',
          value: 30,
          unit: 'minutes'
        },
        trust: 'always'
      };

      const content = await urlCache.fetchURL(
        'https://example.com/test.md',
        security,
        'test-variable'
      );

      expect(content).toBe('# Test Content\n\nThis is test content from URL.');
      expect(fetch).toHaveBeenCalledWith('https://example.com/test.md');
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return cached content when available and not expired', async () => {
      // Set up cache entry
      const cacheEntry = {
        url: 'https://example.com/test.md',
        hash: 'abc123',
        cachedAt: new Date().toISOString(),
        ttl: { type: 'duration', value: 30, unit: 'minutes' },
        trust: 'always',
        configuredBy: 'test-variable',
        expiresAt: new Date(Date.now() + 1800000).toISOString() // 30 min from now
      };

      mockLockFile.data.cache.urls['https://example.com/test.md'] = cacheEntry;
      mockCache.get.mockResolvedValue('Cached content');

      const security: SecurityOptions = {
        ttl: {
          type: 'duration',
          value: 30,
          unit: 'minutes'
        },
        trust: 'always'
      };

      const content = await urlCache.fetchURL(
        'https://example.com/test.md',
        security,
        'test-variable'
      );

      expect(content).toBe('Cached content');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const security: SecurityOptions = {
        ttl: {
          type: 'duration',
          value: 5,
          unit: 'minutes'
        },
        trust: 'always'
      };

      await expect(
        urlCache.fetchURL('https://example.com/test.md', security, 'test-variable')
      ).rejects.toThrow('Failed to fetch https://example.com/test.md: Network error');
    });
  });

  describe('TTL serialization', () => {
    it('should serialize duration TTL correctly', () => {
      const ttl: TTLOption = {
        type: 'duration',
        value: 5,
        unit: 'minutes'
      };

      const serialized = (urlCache as any).serializeTTL(ttl);
      expect(serialized).toBe('5minutes');
    });

    it('should serialize special TTL values correctly', () => {
      const liveTTL: TTLOption = { type: 'special', value: 0 };
      const staticTTL: TTLOption = { type: 'special', value: -1 };

      expect((urlCache as any).serializeTTL(liveTTL)).toBe('live');
      expect((urlCache as any).serializeTTL(staticTTL)).toBe('static');
    });
  });
});