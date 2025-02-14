import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathService } from './PathService';
import { PathValidationError, PathErrorCode } from '../../core/errors/PathValidationError';
import { MemfsTestFileSystem } from '../../tests/utils/MemfsTestFileSystem';
import { TestContext } from '../../tests/utils/TestContext';

describe('PathService', () => {
  let pathService: PathService;
  let fileSystem: MemfsTestFileSystem;
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    fileSystem = new MemfsTestFileSystem();
    await fileSystem.initialize();
    pathService = new PathService(fileSystem);
  });

  afterEach(async () => {
    await context.cleanup();
    await fileSystem.cleanup();
  });

  describe('Path validation', () => {
    it('validates empty path', async () => {
      await expect(pathService.validatePath('')).rejects.toThrow(PathValidationError);
      await expect(pathService.validatePath('')).rejects.toMatchObject({
        code: PathErrorCode.INVALID_PATH
      });
    });

    it('validates path with null bytes', async () => {
      await expect(pathService.validatePath('file\0.txt')).rejects.toThrow(PathValidationError);
      await expect(pathService.validatePath('file\0.txt')).rejects.toMatchObject({
        code: PathErrorCode.NULL_BYTE
      });
    });

    it('validates path is within base directory', async () => {
      const baseDir = 'project/test-base';
      await expect(pathService.validatePath('../outside.txt', { baseDir }))
        .rejects.toThrow(PathValidationError);
      await expect(pathService.validatePath('../outside.txt', { baseDir }))
        .rejects.toMatchObject({
          code: PathErrorCode.OUTSIDE_BASE_DIR
        });
    });

    it('allows paths outside base directory when configured', async () => {
      const baseDir = 'project/test-base';
      const filePath = '/other/dir/file.txt';
      await expect(pathService.validatePath(filePath, {
        baseDir,
        allowOutsideBaseDir: true,
        mustExist: false
      })).resolves.not.toThrow();
    });

    it('validates file existence', async () => {
      // Mock file system state
      await fileSystem.writeFile('project/src/main.meld', '@text greeting = "Hello World"');
      
      // Should pass for existing file
      await expect(pathService.validatePath('project/src/main.meld'))
        .resolves.not.toThrow();
      
      // Should fail for non-existent file
      await expect(pathService.validatePath('project/src/nonexistent.meld'))
        .rejects.toThrow(PathValidationError);
      await expect(pathService.validatePath('project/src/nonexistent.meld'))
        .rejects.toMatchObject({
          code: PathErrorCode.PATH_NOT_FOUND
        });
    });

    it('skips existence check when configured', async () => {
      await expect(pathService.validatePath('nonexistent.txt', { mustExist: false }))
        .resolves.not.toThrow();
    });

    it('validates file type', async () => {
      // Mock file system state
      await fileSystem.mkdir('project/test-dir');
      await fileSystem.writeFile('project/test-file.txt', 'content');

      // Directory when file expected
      await expect(pathService.validatePath('project/test-dir', { mustBeFile: true }))
        .rejects.toMatchObject({
          code: PathErrorCode.NOT_A_FILE
        });

      // File when directory expected
      await expect(pathService.validatePath('project/test-file.txt', { mustBeDirectory: true }))
        .rejects.toMatchObject({
          code: PathErrorCode.NOT_A_DIRECTORY
        });
    });
  });

  describe('Path normalization', () => {
    it('normalizes paths', () => {
      expect(pathService.normalizePath('project/./test/../src/main.meld'))
        .toBe('project/src/main.meld');
      expect(pathService.normalizePath('/absolute/./path/../to/file.txt'))
        .toBe('/absolute/to/file.txt');
    });

    it('joins paths', () => {
      expect(pathService.join('project', 'src', 'main.meld'))
        .toBe('project/src/main.meld');
      expect(pathService.join('/absolute', 'path', 'file.txt'))
        .toBe('/absolute/path/file.txt');
    });

    it('gets dirname', () => {
      expect(pathService.dirname('project/src/main.meld'))
        .toBe('project/src');
      expect(pathService.dirname('/absolute/path/file.txt'))
        .toBe('/absolute/path');
    });

    it('gets basename', () => {
      expect(pathService.basename('project/src/main.meld'))
        .toBe('main.meld');
      expect(pathService.basename('/absolute/path/file.txt'))
        .toBe('file.txt');
    });
  });

  describe('Test mode', () => {
    it('toggles test mode', () => {
      expect(pathService.isTestMode()).toBe(false);
      pathService.enableTestMode();
      expect(pathService.isTestMode()).toBe(true);
      pathService.disableTestMode();
      expect(pathService.isTestMode()).toBe(false);
    });
  });
}); 