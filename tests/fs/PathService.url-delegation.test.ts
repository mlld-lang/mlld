import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PathService } from '@services/fs/PathService/PathService.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver.js';
import type { URLResponse } from '@services/fs/PathService/IURLCache.js';

// Mock ProjectPathResolver
vi.mock('@services/fs/ProjectPathResolver', () => {
  return {
    ProjectPathResolver: vi.fn().mockImplementation(() => {
      return {
        getProjectPath: vi.fn().mockReturnValue('/mock/project/path')
      };
    })
  };
});

describe('PathService URL delegation to URLContentResolver', () => {
  let pathService: PathService;
  let mockURLContentResolver: URLContentResolver;
  
  beforeEach(() => {
    // Create mock URLContentResolver with spies
    mockURLContentResolver = {
      isURL: vi.fn(),
      validateURL: vi.fn(),
      fetchURL: vi.fn()
    } as unknown as URLContentResolver;
    
    // Create PathService with mock dependencies
    pathService = new PathService(
      new ProjectPathResolver(),
      mockURLContentResolver
    );
  });
  
  describe('isURL method', () => {
    it('should delegate to URLContentResolver', () => {
      // Setup
      mockURLContentResolver.isURL.mockReturnValueOnce(true);
      
      // Execute
      const result = pathService.isURL('https://example.com');
      
      // Verify
      expect(mockURLContentResolver.isURL).toHaveBeenCalledWith('https://example.com');
      expect(result).toBe(true);
    });
    
    it('should pass through false result from URLContentResolver', () => {
      // Setup
      mockURLContentResolver.isURL.mockReturnValueOnce(false);
      
      // Execute
      const result = pathService.isURL('not-a-url');
      
      // Verify
      expect(mockURLContentResolver.isURL).toHaveBeenCalledWith('not-a-url');
      expect(result).toBe(false);
    });
  });
  
  describe('validateURL method', () => {
    it('should delegate to URLContentResolver with no options', async () => {
      // Setup
      mockURLContentResolver.validateURL.mockResolvedValueOnce('https://example.com');
      
      // Execute
      const result = await pathService.validateURL('https://example.com');
      
      // Verify
      expect(mockURLContentResolver.validateURL).toHaveBeenCalledWith('https://example.com', undefined);
      expect(result).toBe('https://example.com');
    });
    
    it('should delegate to URLContentResolver with options', async () => {
      // Setup
      const options = {
        allowedProtocols: ['https'],
        allowedDomains: ['example.com']
      };
      mockURLContentResolver.validateURL.mockResolvedValueOnce('https://example.com');
      
      // Execute
      const result = await pathService.validateURL('https://example.com', options);
      
      // Verify
      expect(mockURLContentResolver.validateURL).toHaveBeenCalledWith('https://example.com', options);
      expect(result).toBe('https://example.com');
    });
    
    it('should pass through errors from URLContentResolver', async () => {
      // Setup
      const error = new Error('Invalid URL');
      mockURLContentResolver.validateURL.mockRejectedValueOnce(error);
      
      // Execute & Verify
      await expect(pathService.validateURL('invalid-url')).rejects.toThrow(error);
      expect(mockURLContentResolver.validateURL).toHaveBeenCalledWith('invalid-url', undefined);
    });
  });
  
  describe('fetchURL method', () => {
    it('should delegate to URLContentResolver with no options', async () => {
      // Setup
      const mockResponse: URLResponse = {
        content: 'content',
        metadata: {
          statusCode: 200,
          contentType: 'text/plain'
        },
        fromCache: false,
        url: 'https://example.com'
      };
      mockURLContentResolver.fetchURL.mockResolvedValueOnce(mockResponse);
      
      // Execute
      const result = await pathService.fetchURL('https://example.com');
      
      // Verify
      expect(mockURLContentResolver.fetchURL).toHaveBeenCalledWith('https://example.com', undefined);
      expect(result).toEqual(mockResponse);
    });
    
    it('should delegate to URLContentResolver with options', async () => {
      // Setup
      const options = {
        bypassCache: true,
        headers: { 'User-Agent': 'Test' }
      };
      const mockResponse: URLResponse = {
        content: 'content',
        metadata: {
          statusCode: 200,
          contentType: 'text/plain'
        },
        fromCache: false,
        url: 'https://example.com'
      };
      mockURLContentResolver.fetchURL.mockResolvedValueOnce(mockResponse);
      
      // Execute
      const result = await pathService.fetchURL('https://example.com', options);
      
      // Verify
      expect(mockURLContentResolver.fetchURL).toHaveBeenCalledWith('https://example.com', options);
      expect(result).toEqual(mockResponse);
    });
    
    it('should pass through errors from URLContentResolver', async () => {
      // Setup
      const error = new Error('Fetch failed');
      mockURLContentResolver.fetchURL.mockRejectedValueOnce(error);
      
      // Execute & Verify
      await expect(pathService.fetchURL('https://example.com')).rejects.toThrow(error);
      expect(mockURLContentResolver.fetchURL).toHaveBeenCalledWith('https://example.com', undefined);
    });
  });
  
  describe('Path validation with URLs', () => {
    it('should correctly integrate with URL validation in validatePath method', async () => {
      // Setup
      mockURLContentResolver.isURL.mockReturnValueOnce(true);
      mockURLContentResolver.validateURL.mockResolvedValueOnce('https://example.com');
      
      // Execute
      const result = await pathService.validatePath('https://example.com', { allowURLs: true });
      
      // Verify
      expect(mockURLContentResolver.isURL).toHaveBeenCalledWith('https://example.com');
      expect(mockURLContentResolver.validateURL).toHaveBeenCalled();
      expect(result).toBe('https://example.com');
    });
  });
});