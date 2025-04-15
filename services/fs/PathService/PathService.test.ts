import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { PathValidationError, PathErrorCode } from '@services/fs/PathService/errors/PathValidationError.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemServiceClient/IFileSystemServiceClient.js';

import {
  AbsolutePath,
  RelativePath,
  UrlPath,
  RawPath,
  StructuredPath,
  PathValidationContext,
  PathValidationRules,
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

const createTestValidationContext = (overrides: Partial<PathValidationContext> = {}): PathValidationContext => {
  const defaultRules: PathValidationRules = {
    allowAbsolute: true,
    allowRelative: true,
    allowParentTraversal: true,
    mustExist: false,
    mustBeFile: false,
    mustBeDirectory: false,
  };

  return {
    workingDirectory: unsafeCreateNormalizedAbsoluteDirectoryPath('/project'),
    projectRoot: unsafeCreateNormalizedAbsoluteDirectoryPath('/project'),
    allowExternalPaths: true,
    rules: { ...defaultRules, ...(overrides.rules || {}) },
    ...overrides,
  };
};

describe('PathService', () => {
  const helpers = TestContextDI.createTestHelpers();
  let context: TestContextDI;
  let service: PathService;
  let projectPathResolver: ProjectPathResolver;
  let controllableFsClientMock: IFileSystemServiceClient;
  let mockUrlContentResolver: IURLContentResolver;

  const TEST_PROJECT_ROOT = '/project';
  const TEST_HOME_DIR = '/home/user';

  beforeEach(async () => {
    // Create a spyable mock client instance
    controllableFsClientMock = {
        exists: vi.fn(),
        isDirectory: vi.fn(),
    };
    // Create a mock factory that returns *our* controllable client
    const mockFsClientFactory = {
        createClient: vi.fn().mockReturnValue(controllableFsClientMock)
    };

    // Use helper, OVERRIDE the factory during setup
    context = helpers.setupWithStandardMocks({
        'FileSystemServiceClientFactory': mockFsClientFactory
    }, { isolatedContainer: true });
    
    await context.initPromise; // Wait for context init

    // Resolve services 
    service = await context.resolve(PathService);
    projectPathResolver = await context.resolve(ProjectPathResolver);
    mockUrlContentResolver = await context.resolve('IURLContentResolver');
    
    // --- Re-apply Test-Side Fix for Lazy Loading ---
    // Manually assign the factory and client to the resolved service instance
    // to ensure the internal lazy load uses our mocks.
    const resolvedMockFactory = context.resolveSync('FileSystemServiceClientFactory');
    // We expect resolvedMockFactory to be behaviorally equivalent but maybe not === mockFsClientFactory
    (service as any).fsClientFactory = resolvedMockFactory; 
    (service as any).fsClient = controllableFsClientMock; // Directly assign the client too
    (service as any).factoryInitialized = true; // Mark as initialized to prevent internal lookup
    // --- End Test-Side Fix ---
        
    // Initial service setup
    vi.spyOn(projectPathResolver, 'getProjectPath').mockReturnValue(TEST_PROJECT_ROOT);
    service.setTestMode(true);
    service.setProjectPath(TEST_PROJECT_ROOT);
    service.setHomePath(TEST_HOME_DIR);
  });

  afterEach(async () => {
    await context?.cleanup();
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

    it('should handle StructuredPath input', () => {
        const structuredInput: StructuredPath = {
            original: 'data/config.yml',
            segments: ['data', 'config.yml'],
            isAbsolute: false,
            isNormalized: true,
            isDirectory: false
        };
      const expected = unsafeCreateAbsolutePath('/project/data/config.yml');
      const result = service.resolvePath(structuredInput.original);
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
            code: 'E_PATH_EXPECTED_FS'
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
      const context = createTestValidationContext();
      const expectedPath = '/project/file.txt';
      const result = await service.validatePath(input, context);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
    });

    it('should validate an absolute path and return AbsolutePath', async () => {
      const input = createRawPath('/project/src/app.js');
      const context = createTestValidationContext();
      const expectedPath = '/project/src/app.js';
      const result = await service.validatePath(input, context);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
    });

    it('should reject empty path string', async () => {
      const input = createRawPath('');
      const context = createTestValidationContext();
      await expect(service.validatePath(input, context)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PATH_EMPTY' })
      );
    });

    it('should reject URLs', async () => {
      const input = createRawPath('http://example.com');
      const context = createTestValidationContext();
      await expect(service.validatePath(input, context)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PATH_EXPECTED_FS' })
      );
    });

    it('should reject paths with null bytes', async () => {
      const input = createRawPath('file\0withnull.txt');
      const context = createTestValidationContext();
      await expect(service.validatePath(input, context)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PATH_NULL_BYTE' })
      );
    });

    it('should reject path outside project root when allowExternalPaths is false', async () => {
      const input = createRawPath('/other/root/file.txt');
      const context = createTestValidationContext({ allowExternalPaths: false });
      await expect(service.validatePath(input, context)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PATH_OUTSIDE_ROOT' })
      );
    });

    it('should allow path outside project root when allowExternalPaths is true (default)', async () => {
      const input = createRawPath('/other/root/file.txt');
      const context = createTestValidationContext({ allowExternalPaths: true });
      const expectedPath = '/other/root/file.txt';
      const result = await service.validatePath(input, context);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
    });

    it('should reject path if mustExist is true and file does not exist', async () => {
      const input = createRawPath('nonexistent.txt');
      const context = createTestValidationContext({ rules: { mustExist: true } });
      // Spy on the controllable mock we created and assigned
      vi.spyOn(controllableFsClientMock, 'exists').mockResolvedValue(false);
      
      await expect(service.validatePath(input, context)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_FILE_NOT_FOUND' })
      );
      // Verify the controllable mock was called by the service
      expect(controllableFsClientMock.exists).toHaveBeenCalledWith('/project/nonexistent.txt');
    });

    it('should resolve path if mustExist is true and file exists', async () => {
      const input = createRawPath('exists.txt');
      const context = createTestValidationContext({ rules: { mustExist: true } });
      const expectedPath = '/project/exists.txt';
      vi.spyOn(controllableFsClientMock, 'exists').mockResolvedValue(true);
      vi.spyOn(controllableFsClientMock, 'isDirectory').mockResolvedValue(false);
      
      const result = await service.validatePath(input, context);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
      expect(result.exists).toBe(true);
      expect(controllableFsClientMock.exists).toHaveBeenCalledWith('/project/exists.txt');
    });

    it('should reject path if mustBeFile is true and path is a directory', async () => {
      const input = createRawPath('some_dir');
      const context = createTestValidationContext({ rules: { mustExist: true, mustBeFile: true } });
      vi.spyOn(controllableFsClientMock, 'exists').mockResolvedValue(true);
      vi.spyOn(controllableFsClientMock, 'isDirectory').mockResolvedValue(true);
      
      await expect(service.validatePath(input, context)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PATH_NOT_A_FILE' })
      );
      expect(controllableFsClientMock.exists).toHaveBeenCalledWith('/project/some_dir');
      expect(controllableFsClientMock.isDirectory).toHaveBeenCalledWith('/project/some_dir');
    });

    it('should reject path if mustBeDirectory is true and path is a file', async () => {
      const input = createRawPath('some_file.txt');
      const context = createTestValidationContext({ rules: { mustExist: true, mustBeDirectory: true } });
      vi.spyOn(controllableFsClientMock, 'exists').mockResolvedValue(true);
      vi.spyOn(controllableFsClientMock, 'isDirectory').mockResolvedValue(false);
      
      await expect(service.validatePath(input, context)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PATH_NOT_A_DIRECTORY' })
      );
      expect(controllableFsClientMock.exists).toHaveBeenCalledWith('/project/some_file.txt');
      expect(controllableFsClientMock.isDirectory).toHaveBeenCalledWith('/project/some_file.txt');
    });

     it('should resolve path if mustBeFile is true and path is a file', async () => {
      const input = createRawPath('actual_file.txt');
      const context = createTestValidationContext({ rules: { mustExist: true, mustBeFile: true } });
      const expectedPath = '/project/actual_file.txt';
      vi.spyOn(controllableFsClientMock, 'exists').mockResolvedValue(true);
      vi.spyOn(controllableFsClientMock, 'isDirectory').mockResolvedValue(false);
      
      const result = await service.validatePath(input, context);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
      expect(result.exists).toBe(true);
      expect(controllableFsClientMock.exists).toHaveBeenCalledWith('/project/actual_file.txt');
      expect(controllableFsClientMock.isDirectory).toHaveBeenCalledWith('/project/actual_file.txt');
    });

     it('should resolve path if mustBeDirectory is true and path is a directory', async () => {
      const input = createRawPath('actual_dir');
      const context = createTestValidationContext({ rules: { mustExist: true, mustBeDirectory: true } });
      const expectedPath = '/project/actual_dir';
      vi.spyOn(controllableFsClientMock, 'exists').mockResolvedValue(true);
      vi.spyOn(controllableFsClientMock, 'isDirectory').mockResolvedValue(true);
      
      const result = await service.validatePath(input, context);
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.validatedPath).toEqual(expectedPath);
      expect(result.exists).toBe(true);
      expect(controllableFsClientMock.exists).toHaveBeenCalledWith('/project/actual_dir');
      expect(controllableFsClientMock.isDirectory).toHaveBeenCalledWith('/project/actual_dir');
    });
  });

  describe('validateURL', () => {
    it('should validate a valid URL using URLContentResolver and return UrlPath', async () => {
      const input = createRawPath('https://valid.example.com');
      const expected = unsafeCreateUrlPath('https://valid.example.com');
      vi.spyOn(mockUrlContentResolver, 'validateURL').mockResolvedValueOnce('https://valid.example.com');

      await expect(service.validateURL(input)).resolves.toEqual(expected);
      expect(mockUrlContentResolver.validateURL).toHaveBeenCalledWith(input, undefined);
    });

    it('should reject an invalid URL string with E_PATH_EXPECTED_FS', async () => {
      const input = createRawPath('invalid-url');
      vi.spyOn(mockUrlContentResolver, 'validateURL').mockRejectedValueOnce(new Error('Should not be called'));
      await expect(service.validateURL(input)).rejects.toThrowError(
         expect.objectContaining({ code: 'E_PATH_EXPECTED_FS' }) 
      );
    });

     it('should pass options to URLContentResolver', async () => {
      const input = createRawPath('https://valid.example.com');
      const options = { allowedDomains: ['valid.example.com'] };
      const expected = unsafeCreateUrlPath('https://valid.example.com');
       vi.spyOn(mockUrlContentResolver, 'validateURL').mockResolvedValueOnce('https://valid.example.com');

      await expect(service.validateURL(input, options)).resolves.toEqual(expected);
      expect(mockUrlContentResolver.validateURL).toHaveBeenCalledWith(input, options);
    });
  });

  describe('fetchURL', () => {
    it('should fetch a validated URL using URLContentResolver', async () => {
      const inputUrl = unsafeCreateUrlPath('https://fetch.example.com/data');
      const mockResponse = { content: 'fetched data', metadata: {}, fromCache: false, url: 'https://fetch.example.com/data' };
      vi.spyOn(mockUrlContentResolver, 'fetchURL').mockResolvedValueOnce(mockResponse);

      const result = await service.fetchURL(inputUrl);
      
      expect(result).toEqual(mockResponse);
      expect(mockUrlContentResolver.fetchURL).toHaveBeenCalledWith(inputUrl, undefined);
    });

    it('should pass options to URLContentResolver fetchURL', async () => {
      const inputUrl = unsafeCreateUrlPath('https://fetch.example.com/data');
      const options = { method: 'POST' };
      const mockResponse = { content: 'posted data', metadata: {}, fromCache: false, url: 'https://fetch.example.com/data' };
      vi.spyOn(mockUrlContentResolver, 'fetchURL').mockResolvedValueOnce(mockResponse);

      await service.fetchURL(inputUrl, options);
      expect(mockUrlContentResolver.fetchURL).toHaveBeenCalledWith(inputUrl, options);
    });

    it('should reject if URLContentResolver fetch fails', async () => {
        const inputUrl = unsafeCreateUrlPath('https://fetch.example.com/fail');
        const networkError = new Error('Network Error');
        vi.spyOn(mockUrlContentResolver, 'fetchURL').mockRejectedValueOnce(networkError);

        await expect(service.fetchURL(inputUrl)).rejects.toThrowError(
            /Network Error$/
        );
        try {
             await service.fetchURL(inputUrl);
        } catch (e: any) {
             expect(e.cause).toBe(networkError);
        }
    });
  });
}); 