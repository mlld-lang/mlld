import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import { createLocation } from '@tests/utils/testFactories.js';

describe('PathService', () => {
  let context: TestContext;
  let service: PathService;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();

    service = new PathService();
    service.initialize(context.fs);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Path validation', () => {
    it('validates empty path', async () => {
      const location = createLocation(1, 1, 1, 1, 'test.meld');
      await expect(service.validatePath('', { location })).rejects.toMatchObject({
        message: expect.stringContaining('Path cannot be empty'),
        code: PathErrorCode.INVALID_PATH,
        location
      });
    });

    it('validates path with null bytes', async () => {
      const location = createLocation(1, 1, 1, 9, 'test.meld');
      await expect(service.validatePath('file\0.txt', { location })).rejects.toMatchObject({
        message: expect.stringContaining('Path cannot contain null bytes'),
        code: PathErrorCode.NULL_BYTE,
        location
      });
    });

    it('validates path is within base directory', async () => {
      // Create test directory structure
      const basePath = context.fs.getPath('base');
      const allowedPath = context.fs.getPath('base/allowed.txt');
      const outsidePath = context.fs.getPath('outside.txt');
      const location = createLocation(1, 1, 1, 15, 'test.meld');

      await context.fs.writeFile(allowedPath, 'content');
      await context.fs.writeFile(outsidePath, 'content');

      // Test path within base dir
      await expect(service.validatePath(allowedPath, { 
        baseDir: basePath,
        allowOutsideBaseDir: false,
        location
      })).resolves.not.toThrow();

      // Test path outside base dir
      await expect(service.validatePath(outsidePath, { 
        baseDir: basePath,
        allowOutsideBaseDir: false,
        location
      })).rejects.toMatchObject({
        message: expect.stringContaining('Path must be within base directory'),
        code: PathErrorCode.OUTSIDE_BASE_DIR,
        location
      });
    });

    it('allows paths outside base directory when configured', async () => {
      const basePath = context.fs.getPath('base');
      const outsidePath = context.fs.getPath('outside.txt');
      const location = createLocation(1, 1, 1, 15, 'test.meld');

      await context.fs.writeFile(outsidePath, 'content');

      await expect(service.validatePath(outsidePath, {
        baseDir: basePath,
        allowOutsideBaseDir: true,
        location
      })).resolves.not.toThrow();
    });

    it('validates file existence', async () => {
      const filePath = context.fs.getPath('project/src/main.meld');
      const location = createLocation(1, 1, 1, 20, 'test.meld');
      await context.fs.writeFile(filePath, 'content');

      // Should pass for existing file
      await expect(service.validatePath(filePath, {
        mustExist: true,
        location
      })).resolves.not.toThrow();

      // Should fail for non-existent file
      const missingPath = context.fs.getPath('missing.md');
      await expect(service.validatePath(missingPath, {
        mustExist: true,
        location
      })).rejects.toMatchObject({
        message: expect.stringContaining('Path does not exist'),
        code: PathErrorCode.PATH_NOT_FOUND,
        location
      });
    });

    it('skips existence check when configured', async () => {
      const nonexistentPath = context.fs.getPath('nonexistent.txt');
      const location = createLocation(1, 1, 1, 20, 'test.meld');
      await expect(service.validatePath(nonexistentPath, {
        mustExist: false,
        location
      })).resolves.not.toThrow();
    });

    it('validates file type', async () => {
      const filePath = context.fs.getPath('test.txt');
      const dirPath = context.fs.getPath('testdir');
      const location = createLocation(1, 1, 1, 15, 'test.meld');

      await context.fs.writeFile(filePath, 'content');
      await context.fs.mkdir(dirPath);

      // Test file validation
      await expect(service.validatePath(filePath, {
        mustBeFile: true,
        location
      })).resolves.not.toThrow();

      await expect(service.validatePath(dirPath, {
        mustBeFile: true,
        location
      })).rejects.toMatchObject({
        message: expect.stringContaining('Path must be a file'),
        code: PathErrorCode.NOT_A_FILE,
        location
      });

      // Test directory validation
      await expect(service.validatePath(dirPath, {
        mustBeDirectory: true,
        location
      })).resolves.not.toThrow();

      await expect(service.validatePath(filePath, {
        mustBeDirectory: true,
        location
      })).rejects.toMatchObject({
        message: expect.stringContaining('Path must be a directory'),
        code: PathErrorCode.NOT_A_DIRECTORY,
        location
      });
    });
  });

  describe('Path normalization', () => {
    it('normalizes paths', () => {
      expect(service.normalizePath('path/./to/../file.txt'))
        .toBe('path/file.txt');
    });

    it('joins paths', () => {
      expect(service.join('path', 'to', 'file.txt'))
        .toBe('path/to/file.txt');
    });

    it('gets dirname', () => {
      expect(service.dirname('path/to/file.txt'))
        .toBe('path/to');
    });

    it('gets basename', () => {
      expect(service.basename('path/to/file.txt'))
        .toBe('file.txt');
    });
  });

  describe('Test mode', () => {
    it('toggles test mode', () => {
      service.enableTestMode();
      expect(service.isTestMode()).toBe(true);

      service.disableTestMode();
      expect(service.isTestMode()).toBe(false);
    });
  });
}); 