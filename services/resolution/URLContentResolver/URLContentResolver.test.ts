import { URLContentResolver } from './URLContentResolver';
import { URLSecurityError, URLValidationError } from './errors/index';
import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('URLContentResolver', () => {
  let resolver: URLContentResolver;

  beforeEach(() => {
    resolver = new URLContentResolver();
    
    // Mock fetch for testing
    global.fetch = vi.fn();
  });

  describe('isURL()', () => {
    it('should return true for valid URLs', () => {
      expect(resolver.isURL('https://example.com')).toBe(true);
      expect(resolver.isURL('http://localhost:8080')).toBe(true);
      expect(resolver.isURL('https://api.github.com/repos/user/repo')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(resolver.isURL('')).toBe(false);
      expect(resolver.isURL('not-a-url')).toBe(false);
      expect(resolver.isURL('/path/to/file.txt')).toBe(false);
      expect(resolver.isURL('./relative/path')).toBe(false);
    });
  });

  describe('validateURL()', () => {
    it('should pass valid URLs', async () => {
      const url = 'https://example.com';
      const result = await resolver.validateURL(url);
      expect(result).toBe(url);
    });

    it('should throw URLValidationError for invalid URLs', async () => {
      await expect(resolver.validateURL('invalid-url')).rejects.toThrow(URLValidationError);
    });

    it('should throw URLSecurityError for blocked protocols', async () => {
      await expect(
        resolver.validateURL('ftp://example.com', { allowedProtocols: ['http', 'https'] })
      ).rejects.toThrow(URLSecurityError);
    });

    it('should throw URLSecurityError for blocked domains', async () => {
      await expect(
        resolver.validateURL('https://blocked.com', { blockedDomains: ['blocked.com'] })
      ).rejects.toThrow(URLSecurityError);
    });

    it('should throw URLSecurityError for domains not in allowlist', async () => {
      await expect(
        resolver.validateURL('https://example.com', { allowedDomains: ['allowed.com'] })
      ).rejects.toThrow(URLSecurityError);
    });
  });

  describe('fetchURL()', () => {
    it('should fetch and return content from URLs', async () => {
      const url = 'https://example.com';
      const mockResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('Content from URL'),
        headers: new Headers({
          'content-type': 'text/plain',
          'last-modified': 'Wed, 01 Jan 2023 00:00:00 GMT'
        }),
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      const result = await resolver.fetchURL(url);
      
      expect(global.fetch).toHaveBeenCalledWith(url, expect.anything());
      expect(result.content).toBe('Content from URL');
      expect(result.metadata.statusCode).toBe(200);
      expect(result.metadata.contentType).toBe('text/plain');
      expect(result.fromCache).toBe(false);
      expect(result.url).toBe(url);
    });

    it('should return cached responses when available', async () => {
      const url = 'https://example.com';
      const mockResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('Content from URL'),
        headers: new Headers({
          'content-type': 'text/plain'
        }),
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      // First call to populate cache
      await resolver.fetchURL(url);
      
      // Reset the mock to verify it's not called again
      (global.fetch as any).mockClear();
      
      // Second call should use cache
      const result = await resolver.fetchURL(url);
      
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.content).toBe('Content from URL');
      expect(result.fromCache).toBe(true);
    });

    it('should bypass cache when requested', async () => {
      const url = 'https://example.com';
      const mockResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('Content from URL'),
        headers: new Headers({
          'content-type': 'text/plain'
        }),
      };
      
      (global.fetch as any).mockResolvedValue(mockResponse);
      
      // First call to populate cache
      await resolver.fetchURL(url);
      
      // Reset the mock to verify it's called again
      (global.fetch as any).mockClear();
      
      // Second call with bypassCache should not use cache
      await resolver.fetchURL(url, { bypassCache: true });
      
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});