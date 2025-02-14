import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../../tests/utils/TestContext';
import { PathService } from './PathService';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError';

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
      await expect(service.validatePath('')).rejects.toThrow(
        new PathValidationError('Path cannot be empty', PathErrorCode.INVALID_PATH)
      );
    });

    it('validates path with null bytes', async () => {
      await expect(service.validatePath('file\0.txt')).rejects.toThrow(
        new PathValidationError('Path cannot contain null bytes', PathErrorCode.NULL_BYTE)
      );
    });

    it('validates path is within base directory', async () => {
      // Create test directory structure
      const basePath = context.fs.getPath('base');
      const allowedPath = context.fs.getPath('base/allowed.txt');
      const outsidePath = context.fs.getPath('outside.txt');

      await context.fs.writeFile(allowedPath, 'content');
      await context.fs.writeFile(outsidePath, 'content');

      // Test path within base dir
      await expect(service.validatePath(allowedPath, { 
        baseDir: basePath,
        allowOutsideBaseDir: false 
      })).resolves.not.toThrow();

      // Test path outside base dir
      await expect(service.validatePath(outsidePath, { 
        baseDir: basePath,
        allowOutsideBaseDir: false 
      })).rejects.toThrow(
        new PathValidationError(
          `Path must be within base directory: ${basePath}`,
          PathErrorCode.OUTSIDE_BASE_DIR
        )
      );
    });

    it('allows paths outside base directory when configured', async () => {
      const basePath = context.fs.getPath('base');
      const insidePath = context.fs.getPath('base/inside.txt');
      const outsidePath = context.fs.getPath('outside.txt');

      await context.fs.writeFile(insidePath, 'content');
      await context.fs.writeFile(outsidePath, 'content');

      await expect(service.validatePath(outsidePath, {
        baseDir: basePath,
        allowOutsideBaseDir: true
      })).resolves.not.toThrow();
    });

    it('validates file existence', async () => {
      const filePath = context.fs.getPath('project/src/main.meld');
      await context.fs.writeFile(filePath, 'content');

      // Should pass for existing file
      await expect(service.validatePath(filePath, {
        mustExist: true
      })).resolves.not.toThrow();

      // Should fail for non-existent file
      const missingPath = context.fs.getPath('missing.md');
      await expect(service.validatePath(missingPath, {
        mustExist: true
      })).rejects.toThrow(
        new PathValidationError(
          `Path does not exist: ${missingPath}`,
          PathErrorCode.PATH_NOT_FOUND
        )
      );
    });

    it('skips existence check when configured', async () => {
      const nonexistentPath = context.fs.getPath('nonexistent.txt');
      await expect(service.validatePath(nonexistentPath, {
        mustExist: false
      })).resolves.not.toThrow();
    });

    it('validates file type', async () => {
      const filePath = context.fs.getPath('test.txt');
      const dirPath = context.fs.getPath('testdir');

      await context.fs.writeFile(filePath, 'content');
      await context.fs.mkdir(dirPath);

      // Test file validation
      await expect(service.validatePath(filePath, {
        mustBeFile: true
      })).resolves.not.toThrow();

      await expect(service.validatePath(dirPath, {
        mustBeFile: true
      })).rejects.toThrow(
        new PathValidationError(
          `Path must be a file: ${dirPath}`,
          PathErrorCode.NOT_A_FILE
        )
      );

      // Test directory validation
      await expect(service.validatePath(dirPath, {
        mustBeDirectory: true
      })).resolves.not.toThrow();

      await expect(service.validatePath(filePath, {
        mustBeDirectory: true
      })).rejects.toThrow(
        new PathValidationError(
          `Path must be a directory: ${filePath}`,
          PathErrorCode.NOT_A_DIRECTORY
        )
      );
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