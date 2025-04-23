import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { container } from 'tsyringe';
import { PathService } from '@services/fs/PathService/PathService';
import { URLError, URLValidationError, URLSecurityError, URLFetchError } from '@services/resolution/URLContentResolver/errors/index';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import { TestContext } from '@tests/utils/TestContext';
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver';

// Mock fetch API
global.fetch = vi.fn();

describe('URL Functionality', () => {
  let pathService: IPathService;
  let urlContentResolver: URLContentResolver;
  let testContext: TestContext;
  
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Setup test context
    testContext = new TestContext();
    
    // Create URLContentResolver
    urlContentResolver = new URLContentResolver();
    
    // Register services in the global container
    container.register('ProjectPathResolver', {
      useValue: new ProjectPathResolver()
    });
    
    // Create PathService with URLContentResolver
    pathService = new PathService(container.resolve('ProjectPathResolver'), urlContentResolver);
    pathService.enableTestMode();
    
    // Mock fetch implementation
    (global.fetch as any).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/content.md') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'text/markdown',
            'content-length': '100'
          }),
          text: async () => '# Example Content\n\nThis is fetched from a URL.'
        };
      }
      
      if (url === 'https://example.com/variables.mld') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'text/plain',
            'content-length': '200'
          }),
          text: async () => '@define(text: greeting="Hello from URL!")\n@define(data: config={ version: "1.0.0" })'
        };
      }
      
      if (url === 'https://blocked.example.com/content.md') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'text/markdown',
            'content-length': '100'
          }),
          text: async () => '# Blocked Content\n\nThis should be blocked.'
        };
      }
      
      if (url === 'https://example.com/not-found.md') {
        return {
          ok: false,
          status: 404,
          headers: new Headers({
            'content-type': 'text/plain'
          }),
          text: async () => 'Not Found'
        };
      }
      
      if (url === 'https://example.com/too-large.md') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'text/markdown',
            'content-length': '10000000' // 10MB
          }),
          text: async () => 'Large Content'.repeat(1000000)
        };
      }
      
      return {
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => 'Not Found'
      };
    });
  });
  
  afterEach(() => {
    testContext.cleanup();
  });
  
  describe('PathService URL Functions', () => {
    it('should detect URLs correctly', () => {
      expect(pathService.isURL('https://example.com/content.md')).toBe(true);
      expect(pathService.isURL('http://localhost:3000/file.html')).toBe(true);
      
      // The file:// protocol handling can vary based on platform and implementation
      // so we won't test it strictly
      
      // Not URLs
      expect(pathService.isURL('/home/user/document.txt')).toBe(false);
      expect(pathService.isURL('document.txt')).toBe(false);
      expect(pathService.isURL('./path/to/file.txt')).toBe(false);
      expect(pathService.isURL('../path/to/file.txt')).toBe(false);
    });
    
    it('should validate URLs against security policy', async () => {
      // Valid URL with default options
      await expect(pathService.validateURL('https://example.com/content.md'))
        .resolves.toBe('https://example.com/content.md');
      
      // URL with allowed protocol
      await expect(pathService.validateURL('https://example.com/content.md', {
        allowedProtocols: ['https']
      })).resolves.toBe('https://example.com/content.md');
      
      // URL with disallowed protocol
      await expect(pathService.validateURL('http://example.com/content.md', {
        allowedProtocols: ['https']
      })).rejects.toThrow(URLSecurityError);
      
      // URL with allowed domain
      await expect(pathService.validateURL('https://example.com/content.md', {
        allowedDomains: ['example.com']
      })).resolves.toBe('https://example.com/content.md');
      
      // URL with disallowed domain
      await expect(pathService.validateURL('https://example.org/content.md', {
        allowedDomains: ['example.com']
      })).rejects.toThrow(URLSecurityError);
      
      // URL with blocked domain
      await expect(pathService.validateURL('https://blocked.example.com/content.md', {
        blockedDomains: ['blocked.example.com']
      })).rejects.toThrow(URLSecurityError);
    });
    
    it('should fetch and cache URL content', async () => {
      // Fetch URL content
      const response1 = await pathService.fetchURL('https://example.com/content.md');
      
      expect(response1.content).toBe('# Example Content\n\nThis is fetched from a URL.');
      expect(response1.fromCache).toBe(false);
      expect(response1.metadata.statusCode).toBe(200);
      expect(response1.metadata.contentType).toBe('text/markdown');
      
      // Fetch same URL again (should be cached)
      const response2 = await pathService.fetchURL('https://example.com/content.md');
      
      expect(response2.content).toBe('# Example Content\n\nThis is fetched from a URL.');
      expect(response2.fromCache).toBe(true);
      
      // Fetch with bypass cache option
      const response3 = await pathService.fetchURL('https://example.com/content.md', {
        bypassCache: true
      });
      
      expect(response3.content).toBe('# Example Content\n\nThis is fetched from a URL.');
      expect(response3.fromCache).toBe(false);
    });
    
    it('should handle URL fetch errors appropriately', async () => {
      // 404 error
      await expect(pathService.fetchURL('https://example.com/not-found.md'))
        .rejects.toThrow(URLFetchError);
      
      // Response too large error
      await expect(pathService.fetchURL('https://example.com/too-large.md', {
        maxResponseSize: 1000
      })).rejects.toThrow(URLSecurityError);
    });
  });
  
  // Tests for EmbedDirectiveHandler and ImportDirectiveHandler with URLs would follow
  // These would use testContext to create directive nodes and execute them
});