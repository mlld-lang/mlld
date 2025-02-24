import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';

describe('PathService', () => {
  let context: TestContext;
  let service: PathService;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    service = context.services.path;
    service.setHomePath('/home/user');
    service.setProjectPath('/project/root');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Path validation', () => {
    it('validates empty path', async () => {
      await expect(service.validatePath('')).rejects.toThrow(PathValidationError);
    });

    it('validates path with null bytes', async () => {
      await expect(service.validatePath('test\0.txt')).rejects.toThrow(PathValidationError);
    });

    it('validates path is within base directory', async () => {
      const filePath = '$./test.txt';
      const outsidePath = '$~/outside.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Create test files
      await context.fs.writeFile('/project/root/test.txt', 'test');
      await context.fs.writeFile('/home/user/outside.txt', 'test');

      // Test path within base dir
      await expect(service.validatePath(filePath, {
        allowOutsideBaseDir: false,
        location
      })).resolves.not.toThrow();

      // Test path outside base dir
      await expect(service.validatePath(outsidePath, {
        allowOutsideBaseDir: false,
        location
      })).rejects.toThrow(PathValidationError);
    });

    it('allows paths outside base directory when configured', async () => {
      const filePath = '$~/outside.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Create test file
      await context.fs.writeFile('/home/user/outside.txt', 'test');

      await expect(service.validatePath(filePath, {
        allowOutsideBaseDir: true,
        location
      })).resolves.not.toThrow();
    });

    it('validates file existence', async () => {
      const filePath = '$./test.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Create test file
      await context.fs.writeFile('/project/root/test.txt', 'test');

      // Should pass for existing file
      await expect(service.validatePath(filePath, {
        mustExist: true,
        location
      })).resolves.not.toThrow();

      // Should fail for non-existent file
      await expect(service.validatePath('$./nonexistent.txt', {
        mustExist: true,
        location
      })).rejects.toThrow(PathValidationError);
    });

    it('skips existence check when configured', async () => {
      const filePath = '$./nonexistent.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      await expect(service.validatePath(filePath, {
        mustExist: false,
        location
      })).resolves.not.toThrow();
    });

    it('validates file type', async () => {
      const filePath = '$./test.txt';
      const dirPath = '$./testdir';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Create test file and directory
      await context.fs.writeFile('/project/root/test.txt', 'test');
      await context.fs.mkdir('/project/root/testdir');

      await expect(service.validatePath(filePath, {
        mustBeFile: true,
        location
      })).resolves.not.toThrow();

      await expect(service.validatePath(dirPath, {
        mustBeFile: true,
        location
      })).rejects.toThrow(PathValidationError);

      await expect(service.validatePath(dirPath, {
        mustBeDirectory: true,
        location
      })).resolves.not.toThrow();

      await expect(service.validatePath(filePath, {
        mustBeDirectory: true,
        location
      })).rejects.toThrow(PathValidationError);
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