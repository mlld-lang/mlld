import { PathService } from '@services/fs/PathService/PathService.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import { URLValidationError, URLSecurityError } from '@services/resolution/URLContentResolver/errors/index.js';
import { container } from 'tsyringe';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver.js';

// Mock global fetch
global.fetch = vi.fn();

describe('URL Handling in PathService', () => {
  let pathService: PathService;
  let urlContentResolver: URLContentResolver;
  
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Create URLContentResolver
    urlContentResolver = new URLContentResolver();
    
    // Create path service instance with URLContentResolver
    const projectPathResolver = { getProjectPath: () => '/project/root' } as ProjectPathResolver;
    pathService = new PathService(projectPathResolver, urlContentResolver);
  });
  
  describe('URL detection', () => {
    it('should detect valid URLs', () => {
      expect(pathService.isURL('https://example.com/file.json')).toBe(true);
      expect(pathService.isURL('http://localhost:3000/api/data')).toBe(true);
      expect(pathService.isURL('ftp://files.example.com/download.zip')).toBe(true);
    });
    
    it('should reject invalid URLs', () => {
      expect(pathService.isURL('')).toBe(false);
      expect(pathService.isURL('not-a-url')).toBe(false);
      expect(pathService.isURL('/absolute/path')).toBe(false);
      expect(pathService.isURL('./relative/path')).toBe(false);
      expect(pathService.isURL('$./project/path')).toBe(false);
    });
  });
  
  describe('URL validation', () => {
    it('should validate URLs against security policy', async () => {
      const url = 'https://example.com/file.json';
      const result = await pathService.validateURL(url);
      expect(result).toBe(url);
    });
    
    it('should reject disallowed protocols', async () => {
      await expect(pathService.validateURL('ftp://example.com/file.json', {
        allowedProtocols: ['http', 'https']
      })).rejects.toThrow(URLSecurityError);
      
      // Should accept when protocol is explicitly allowed
      await expect(pathService.validateURL('ftp://example.com/file.json', {
        allowedProtocols: ['ftp', 'http', 'https']
      })).resolves.toBe('ftp://example.com/file.json');
    });
    
    it('should respect domain allowlist', async () => {
      await expect(pathService.validateURL('https://example.com/file.json', {
        allowedDomains: ['trusted-domain.com']
      })).rejects.toThrow(URLSecurityError);
      
      await expect(pathService.validateURL('https://trusted-domain.com/file.json', {
        allowedDomains: ['trusted-domain.com']
      })).resolves.toBe('https://trusted-domain.com/file.json');
    });
    
    it('should respect domain blocklist', async () => {
      await expect(pathService.validateURL('https://blocked-domain.com/file.json', {
        blockedDomains: ['blocked-domain.com']
      })).rejects.toThrow(URLSecurityError);
      
      // Blocklist takes precedence over allowlist
      await expect(pathService.validateURL('https://blocked-domain.com/file.json', {
        allowedDomains: ['blocked-domain.com'],
        blockedDomains: ['blocked-domain.com']
      })).rejects.toThrow(URLSecurityError);
    });
    
    it('should reject invalid URLs', async () => {
      await expect(pathService.validateURL('invalid-url')).rejects.toThrow(URLValidationError);
    });
  });
  
  describe('URL fetching', () => {
    it('should fetch URL content with caching', async () => {
      const url = 'https://example.com/file.json';
      const content = '{"hello":"world"}';
      
      // Mock successful fetch
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', String(content.length)]
        ]),
        text: () => Promise.resolve(content)
      });
      
      const response = await pathService.fetchURL(url);
      
      expect(response.content).toBe(content);
      expect(response.metadata.statusCode).toBe(200);
      expect(response.metadata.contentType).toBe('application/json');
      expect(response.fromCache).toBe(false);
      expect(response.url).toBe(url);
      
      // Second fetch should come from cache
      const cachedResponse = await pathService.fetchURL(url);
      expect(cachedResponse.fromCache).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    
    it('should handle fetch errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
      
      await expect(pathService.fetchURL('https://example.com/file.json')).rejects.toThrow();
    });
    
    it('should enforce size limits', async () => {
      const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'text/plain'],
          ['content-length', String(largeContent.length)]
        ]),
        text: () => Promise.resolve(largeContent)
      });
      
      await expect(pathService.fetchURL('https://example.com/large-file.txt', {
        maxResponseSize: 5 * 1024 * 1024 // 5MB limit
      })).rejects.toThrow(URLSecurityError);
    });
    
    it('should respect bypass cache option', async () => {
      const url = 'https://example.com/file.json';
      const content1 = '{"version": 1}';
      const content2 = '{"version": 2}';
      
      // First fetch
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(content1)
      });
      
      const response1 = await pathService.fetchURL(url);
      expect(response1.content).toBe(content1);
      
      // Second fetch with bypass cache
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(content2)
      });
      
      const response2 = await pathService.fetchURL(url, { bypassCache: true });
      expect(response2.content).toBe(content2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Path validation with URLs', () => {
    it('should handle URLs in validatePath when allowURLs is true', async () => {
      const url = 'https://example.com/file.json';
      
      // Mock validateURL
      const validateURLSpy = vi.spyOn(pathService, 'validateURL');
      validateURLSpy.mockResolvedValueOnce(url);
      
      const result = await pathService.validatePath(url, { allowURLs: true });
      
      expect(result).toBe(url);
      expect(validateURLSpy).toHaveBeenCalledWith(url, undefined);
    });
    
    it('should not treat URLs as URLs when allowURLs is false', async () => {
      const url = 'https://example.com/file.json';
      
      // Without allowURLs: true, the URL should be treated as a regular path
      await expect(pathService.validatePath(url, { 
        allowURLs: false,
        mustExist: true
      })).rejects.toThrow(); // Should fail as a file path
    });
  });
});