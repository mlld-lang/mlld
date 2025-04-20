import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { PathValidationError, PathErrorCode } from '@core/errors/PathValidationError.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import { container, DependencyContainer } from 'tsyringe';

import {
  AbsolutePath,
  RelativePath,
  UrlPath,
  RawPath,
  PathValidationContext,
  PathValidationRules,
  ValidatedResourcePath,
  NormalizedAbsoluteDirectoryPath,
  createRawPath,
  unsafeCreateAbsolutePath,
  unsafeCreateRelativePath,
  unsafeCreateUrlPath,
  unsafeCreateNormalizedAbsoluteDirectoryPath,
  isAbsolutePath,
  isRelativePath,
  PathContentType
} from '@core/types/paths.js';
import type { StructuredPath } from '@core/syntax/types/nodes.js';

// Import necessary interfaces for mocks
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';

const createTestValidationContext = (overrides: Partial<PathValidationContext> = {}): PathValidationContext => {
  const defaultRules: PathValidationRules = {
    allowAbsolute: true,
    allowRelative: true,
    allowParentTraversal: true,
    mustExist: false,
    mustBeFile: false,
    mustBeDirectory: false,
    // Add other potential optional defaults from PathValidationRules if necessary
    // maxLength: undefined,
    // allowedPrefixes: undefined,
    // disallowedPrefixes: undefined,
    // pattern: undefined,
  };

  return {
    workingDirectory: unsafeCreateNormalizedAbsoluteDirectoryPath('/project'),
    projectRoot: unsafeCreateNormalizedAbsoluteDirectoryPath('/project'),
    allowExternalPaths: true,
    rules: { 
      ...defaultRules, 
      ...(overrides.rules || {}) 
    },
    ...overrides,
  };
};

describe('PathService', () => {
  let testContainer: DependencyContainer;
  let service: PathService;
  let projectPathResolver: ProjectPathResolver;
  let mockFileSystemClient: IFileSystemServiceClient;
  let mockFileSystemClientFactory: FileSystemServiceClientFactory;
  let mockUrlContentResolver: IURLContentResolver;

  const TEST_PROJECT_ROOT = '/project';
  const TEST_HOME_DIR = '/home/user';

  beforeEach(async () => {
    // Create mocks first
    projectPathResolver = new ProjectPathResolver();
    vi.spyOn(projectPathResolver, 'getProjectPath').mockReturnValue(TEST_PROJECT_ROOT);

    // Bypass TS type checking for mock assignment with `any`
    const mockExists = (vi.fn() as any).mockResolvedValue(true);
    const mockIsDirectory = (vi.fn() as any).mockResolvedValue(false);

    // Assign to the mock client object
    mockFileSystemClient = { 
      exists: mockExists, 
      isDirectory: mockIsDirectory,
    } as unknown as IFileSystemServiceClient;
    mockFileSystemClientFactory = {
      createClient: vi.fn().mockReturnValue(mockFileSystemClient)
    } as unknown as FileSystemServiceClientFactory;

    mockUrlContentResolver = {
        validateURL: vi.fn().mockImplementation(async (url: string) => url),
        fetchURL: vi.fn().mockResolvedValue({ content: 'mock url content', metadata: {}, fromCache: false, url: 'mocked'}),
        isURL: vi.fn().mockImplementation((url: string) => /^https?:\/\//i.test(url))
    };

    // Create child container and register mocks directly
    testContainer = container.createChildContainer();
    testContainer.registerInstance(ProjectPathResolver, projectPathResolver); 
    testContainer.registerInstance(FileSystemServiceClientFactory, mockFileSystemClientFactory); 
    testContainer.registerInstance('IURLContentResolver', mockUrlContentResolver); 
    // Register a basic logger mock
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    
    // >>> ADD CONTAINER REGISTRATION <<<
    testContainer.registerInstance('DependencyContainer', testContainer);
    
    // Resolve the service using the test container
    service = testContainer.resolve(PathService);
 
    service.setTestMode(true);
    service.setProjectPath(TEST_PROJECT_ROOT);
    service.setHomePath(TEST_HOME_DIR);
  });

  afterEach(async () => {
    // >>> ADD CONTAINER DISPOSAL <<<
    testContainer?.dispose();
    vi.restoreAllMocks();
  });

  describe('resolvePath', () => {
    it('should resolve a simple relative path to an AbsolutePath based on project root', () => {
      const input = createRawPath('test.txt');
      const expected = unsafeCreateAbsolutePath('/project/test.txt');
      const result = service.resolvePath(input);
      expect(result).toEqual(expected);
    });

    it('should resolve a ./ relative path to an AbsolutePath based on project root', () => {
      const input = createRawPath('./src/file.js');
      const expected = unsafeCreateAbsolutePath('/project/src/file.js');
      const result = service.resolvePath(input);
      expect(result).toEqual(expected);
    });

    it('should resolve a simple path relative to baseDir if provided', () => {
      const input = createRawPath('config.json');
      const baseDir = createRawPath('/opt/data');
      const expected = unsafeCreateAbsolutePath('/opt/data/config.json');
      const result = service.resolvePath(input, baseDir);
      expect(result).toEqual(expected);
    });

    it('should return an AbsolutePath as is (after normalization)', () => {
      const input = createRawPath('/absolute/./test.txt');
      const expected = unsafeCreateAbsolutePath('/absolute/test.txt');
      const result = service.resolvePath(input);
      expect(result).toEqual(expected);
    });

    it('should resolve project path $. correctly', () => {
      const input = createRawPath('$./src/main.ts');
      const expected = unsafeCreateAbsolutePath('/project/src/main.ts');
      const result = service.resolvePath(input);
      expect(result).toEqual(expected);
    });

     it('should resolve project path $PROJECTPATH correctly', () => {
      const input = createRawPath('$PROJECTPATH/data/file.csv');
      const expected = unsafeCreateAbsolutePath('/project/data/file.csv');
      const result = service.resolvePath(input);
      expect(result).toEqual(expected);
    });

    it('should resolve home path $~ correctly', () => {
      const input = createRawPath('$~/docs/notes.txt');
      const expected = unsafeCreateAbsolutePath('/home/user/docs/notes.txt');
      const result = service.resolvePath(input);
      expect(result).toEqual(expected);
    });

    it('should resolve home path $HOMEPATH correctly', () => {
      const input = createRawPath('$HOMEPATH/.config/app');
      const expected = unsafeCreateAbsolutePath('/home/user/.config/app');
      const result = service.resolvePath(input);
      expect(result).toEqual(expected);
    });

    it('should return empty RelativePath for empty input', () => {
      const input = createRawPath('');
      const expected = unsafeCreateRelativePath('');
      const result = service.resolvePath(input);
      expect(result).toEqual(expected);
      expect(isRelativePath(result)).toBe(true);
    });

    it('should throw PathValidationError for URL input', () => {
      const input = createRawPath('https://example.com/file');
      expect(() => service.resolvePath(input)).toThrowError(
        expect.objectContaining({ 
            name: 'PathValidationError',
            code: PathErrorCode.INVALID_PATH
        })
      );
    });
  });

  describe('normalizePath', () => {
    it('should normalize a path with .. correctly', () => {
      const result = service.normalizePath('/project/folder/../test.txt');
      expect(result).toBe('/project/test.txt');
    });
    it('should normalize a path with . correctly', () => {
      const result = service.normalizePath('/project/./src/file.js');
      expect(result).toBe('/project/src/file.js');
    });
     it('should normalize windows paths', () => {
      const result = service.normalizePath('C:\\Users\\User\\Documents');
      expect(result).toBe('C:/Users/User/Documents');
    });
     it('should preserve trailing slash', () => {
      const result = service.normalizePath('/project/dir/');
      expect(result).toBe('/project/dir/');
    });
  });

  describe('validatePath', () => {
    it('should validate a simple relative path and return AbsolutePath', async () => {
      const input = createRawPath('file.txt');
      const contextVal = createTestValidationContext();
      const expectedPath = '/project/file.txt';
      mockFileSystemClient.exists.mockResolvedValue(true);
      const result = await service.validatePath(input, contextVal);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
    });

    it('should validate an absolute path and return AbsolutePath', async () => {
      const input = createRawPath('/project/src/app.js');
      const contextVal = createTestValidationContext();
      const expectedPath = '/project/src/app.js';
      mockFileSystemClient.exists.mockResolvedValue(true);
      const result = await service.validatePath(input, contextVal);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
    });

    it('should reject empty path string', async () => {
      const input = createRawPath('');
      const contextVal = createTestValidationContext();
      await expect(service.validatePath(input, contextVal)).rejects.toThrowError(
        expect.objectContaining({ code: PathErrorCode.INVALID_PATH })
      );
    });

    it('should reject URLs', async () => {
      const input = createRawPath('http://example.com');
      const contextVal = createTestValidationContext();
      await expect(service.validatePath(input, contextVal)).rejects.toThrowError(
        expect.objectContaining({ code: PathErrorCode.INVALID_PATH })
      );
    });

    it('should reject paths with null bytes', async () => {
      const input = createRawPath('file\0withnull.txt');
      const contextVal = createTestValidationContext();
      await expect(service.validatePath(input, contextVal)).rejects.toThrowError(
        expect.objectContaining({ code: PathErrorCode.NULL_BYTE })
      );
    });

    it('should reject path outside project root when allowExternalPaths is false', async () => {
      const input = createRawPath('/other/root/file.txt');
      const contextVal = createTestValidationContext({ allowExternalPaths: false });
      await expect(service.validatePath(input, contextVal)).rejects.toThrowError(
        expect.objectContaining({ code: PathErrorCode.OUTSIDE_BASE_DIR })
      );
    });

    it('should allow path outside project root when allowExternalPaths is true (default)', async () => {
      const input = createRawPath('/other/root/file.txt');
      const contextVal = createTestValidationContext({ allowExternalPaths: true });
      const expectedPath = '/other/root/file.txt';
      const result = await service.validatePath(input, contextVal);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
    });

    it('should reject path if mustExist is true and file does not exist', async () => {
      const input = createRawPath('nonexistent.txt');
      const contextVal = createTestValidationContext({ 
        rules: { 
          allowAbsolute: true,
          allowRelative: true,
          allowParentTraversal: true,
          mustExist: true 
        } 
      });
      mockFileSystemClient.exists.mockResolvedValue(false);
      
      await expect(service.validatePath(input, contextVal)).rejects.toThrowError(
        expect.objectContaining({ code: PathErrorCode.PATH_NOT_FOUND })
      );
      expect(mockFileSystemClient.exists).toHaveBeenCalledWith('/project/nonexistent.txt');
    });

    it('should resolve path if mustExist is true and file exists', async () => {
      const input = createRawPath('exists.txt');
      const contextVal = createTestValidationContext({ 
        rules: { 
          allowAbsolute: true,
          allowRelative: true,
          allowParentTraversal: true,
          mustExist: true 
        } 
      });
      const expectedPath = '/project/exists.txt';
      mockFileSystemClient.exists.mockResolvedValue(true);
      mockFileSystemClient.isDirectory.mockResolvedValue(false);
      
      const result = await service.validatePath(input, contextVal);
      if (result.contentType === PathContentType.FILESYSTEM) {
        expect(result.validatedPath).toEqual(expectedPath);
        expect(result.exists).toBe(true);
      } else {
        expect.fail('Expected filesystem path');
      }
      expect(mockFileSystemClient.exists).toHaveBeenCalledWith('/project/exists.txt');
    });

    it('should reject path if mustBeFile is true and path is a directory', async () => {
      const input = createRawPath('some_dir');
      const contextVal = createTestValidationContext({ 
        rules: { 
          allowAbsolute: true,
          allowRelative: true,
          allowParentTraversal: true,
          mustExist: true, 
          mustBeFile: true 
        } 
      });
      mockFileSystemClient.exists.mockResolvedValue(true);
      mockFileSystemClient.isDirectory.mockResolvedValue(true);
      
      await expect(service.validatePath(input, contextVal)).rejects.toThrowError(
        expect.objectContaining({ code: PathErrorCode.NOT_A_FILE })
      );
      expect(mockFileSystemClient.exists).toHaveBeenCalledWith('/project/some_dir');
      expect(mockFileSystemClient.isDirectory).toHaveBeenCalledWith('/project/some_dir');
    });

    it('should reject path if mustBeDirectory is true and path is a file', async () => {
      const input = createRawPath('some_file.txt');
      const contextVal = createTestValidationContext({ 
        rules: { 
          allowAbsolute: true,
          allowRelative: true,
          allowParentTraversal: true,
          mustExist: true, 
          mustBeDirectory: true 
        } 
      });
      mockFileSystemClient.exists.mockResolvedValue(true);
      mockFileSystemClient.isDirectory.mockResolvedValue(false);
      
      await expect(service.validatePath(input, contextVal)).rejects.toThrowError(
        expect.objectContaining({ code: PathErrorCode.NOT_A_DIRECTORY })
      );
      expect(mockFileSystemClient.exists).toHaveBeenCalledWith('/project/some_file.txt');
      expect(mockFileSystemClient.isDirectory).toHaveBeenCalledWith('/project/some_file.txt');
    });

     it('should resolve path if mustBeFile is true and path is a file', async () => {
      const input = createRawPath('actual_file.txt');
      const contextVal = createTestValidationContext({ 
        rules: { 
          allowAbsolute: true,
          allowRelative: true,
          allowParentTraversal: true,
          mustExist: true, 
          mustBeFile: true 
        } 
      });
      const expectedPath = '/project/actual_file.txt';
      mockFileSystemClient.exists.mockResolvedValue(true);
      mockFileSystemClient.isDirectory.mockResolvedValue(false);
      
      const result = await service.validatePath(input, contextVal);
      if (result.contentType === PathContentType.FILESYSTEM) {
        expect(result.validatedPath).toEqual(expectedPath);
        expect(result.exists).toBe(true);
      } else {
        expect.fail('Expected filesystem path');
      }
      expect(mockFileSystemClient.exists).toHaveBeenCalledWith('/project/actual_file.txt');
      expect(mockFileSystemClient.isDirectory).toHaveBeenCalledWith('/project/actual_file.txt');
    });

     it('should resolve path if mustBeDirectory is true and path is a directory', async () => {
      const input = createRawPath('actual_dir');
      const contextVal = createTestValidationContext({ 
        rules: { 
          allowAbsolute: true,
          allowRelative: true,
          allowParentTraversal: true,
          mustExist: true, 
          mustBeDirectory: true 
        } 
      });
      const expectedPath = '/project/actual_dir';
      mockFileSystemClient.exists.mockResolvedValue(true);
      mockFileSystemClient.isDirectory.mockResolvedValue(true);
      
      const result = await service.validatePath(input, contextVal);
      if (result.contentType === PathContentType.FILESYSTEM) {
        expect(result.validatedPath).toEqual(expectedPath);
        expect(result.exists).toBe(true);
      } else {
        expect.fail('Expected filesystem path');
      }
      expect(mockFileSystemClient.exists).toHaveBeenCalledWith('/project/actual_dir');
      expect(mockFileSystemClient.isDirectory).toHaveBeenCalledWith('/project/actual_dir');
    });
  });

  describe('validateURL', () => {
    it('should validate a valid URL using URLContentResolver and return UrlPath', async () => {
      const input = createRawPath('https://valid.example.com');
      const expected = unsafeCreateUrlPath('https://valid.example.com');
      mockUrlContentResolver.validateURL.mockResolvedValueOnce('https://valid.example.com');

      await expect(service.validateURL(input)).resolves.toEqual(expected);
      expect(mockUrlContentResolver.validateURL).toHaveBeenCalledWith(input, undefined);
    });

    it('should reject an invalid URL string with E_PATH_EXPECTED_FS', async () => {
      const input = createRawPath('invalid-url');
      mockUrlContentResolver.isURL.mockReturnValueOnce(false);
      await expect(service.validateURL(input)).rejects.toThrowError(
         expect.objectContaining({ code: PathErrorCode.INVALID_PATH })
      );
    });

     it('should pass options to URLContentResolver', async () => {
      const input = createRawPath('https://valid.example.com');
      const options = { allowedDomains: ['valid.example.com'] };
      const expected = unsafeCreateUrlPath('https://valid.example.com');
       mockUrlContentResolver.validateURL.mockResolvedValueOnce('https://valid.example.com');

      await expect(service.validateURL(input, options)).resolves.toEqual(expected);
      expect(mockUrlContentResolver.validateURL).toHaveBeenCalledWith(input, options);
    });
  });

  describe('fetchURL', () => {
    it('should fetch a validated URL using URLContentResolver', async () => {
      const inputUrl = unsafeCreateUrlPath('https://fetch.example.com/data');
      const mockResponse = { content: 'fetched data', metadata: {}, fromCache: false, url: 'https://fetch.example.com/data' };
      mockUrlContentResolver.fetchURL.mockResolvedValueOnce(mockResponse);

      const result = await service.fetchURL(inputUrl);
      
      expect(result).toEqual(mockResponse);
      expect(mockUrlContentResolver.fetchURL).toHaveBeenCalledWith(inputUrl, undefined);
    });

    it('should pass options to URLContentResolver fetchURL', async () => {
      const inputUrl = unsafeCreateUrlPath('https://fetch.example.com/data');
      const options = { method: 'POST' };
      const mockResponse = { content: 'posted data', metadata: {}, fromCache: false, url: 'https://fetch.example.com/data' };
      mockUrlContentResolver.fetchURL.mockResolvedValueOnce(mockResponse);

      await service.fetchURL(inputUrl, options);
      expect(mockUrlContentResolver.fetchURL).toHaveBeenCalledWith(inputUrl, options);
    });

    it('should reject if URLContentResolver fetch fails', async () => {
        const inputUrl = unsafeCreateUrlPath('https://fetch.example.com/fail');
        const networkError = new Error('Network Error');
        mockUrlContentResolver.fetchURL.mockRejectedValueOnce(networkError);

        await expect(service.fetchURL(inputUrl)).rejects.toThrowError(
            'URL fetch failed' 
        );
    });
  });
}); 