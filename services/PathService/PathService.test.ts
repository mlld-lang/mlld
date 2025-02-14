import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../../tests/utils';
import { PathService } from './PathService';
import { PathValidationError, PathErrorCode } from '../../core/errors/PathValidationError';

describe('PathService', () => {
  let context: TestContext;
  let pathService: PathService;

  beforeEach(async () => {
    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Initialize service with test filesystem
    pathService = new PathService(context.fs);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Path resolution', () => {
    beforeEach(async () => {
      await context.fixtures.load('pathValidationProject');
    });

    it('resolves relative paths', async () => {
      const baseDir = 'project/test-base';
      const resolved = await pathService.resolvePath('file.txt', { baseDir });
      expect(resolved).toBe(`${baseDir}/file.txt`);
    });

    it('resolves absolute paths', async () => {
      const filePath = '/absolute/path/file.txt';
      const resolved = await pathService.resolvePath(filePath, { allowOutsideBaseDir: true });
      expect(resolved).toBe(filePath);
    });

    it('resolves multiple paths', async () => {
      const baseDir = 'project/test-base';
      const resolved = await pathService.resolvePaths(['file1.txt', 'file2.txt'], { baseDir });
      expect(resolved).toEqual([
        `${baseDir}/file1.txt`,
        `${baseDir}/file2.txt`
      ]);
    });

    it('resolves $PROJECTPATH variables', async () => {
      await context.fixtures.load('basicProject');
      const result = await pathService.resolvePath('$PROJECTPATH/src/main.meld');
      expect(result).toBe('project/src/main.meld');
    });

    it('resolves $HOMEPATH variables', async () => {
      await context.fixtures.load('basicProject');
      const result = await pathService.resolvePath('$HOMEPATH/.config/settings.json');
      expect(result).toBe('home/.config/settings.json');
    });

    it('resolves relative paths from project root', async () => {
      await context.fixtures.load('basicProject');
      const result = await pathService.resolvePath('./src/main.meld');
      expect(result).toBe('project/src/main.meld');
    });
  });

  describe('Path validation', () => {
    beforeEach(async () => {
      await context.fixtures.load('pathValidationProject');
    });

    it('throws on empty path', async () => {
      await expect(pathService.resolvePath('')).rejects.toThrow(PathValidationError);
      await expect(pathService.resolvePath('')).rejects.toMatchObject({
        code: PathErrorCode.INVALID_PATH
      });
    });

    it('throws on null bytes', async () => {
      await expect(pathService.resolvePath('file\0.txt')).rejects.toThrow(PathValidationError);
      await expect(pathService.resolvePath('file\0.txt')).rejects.toMatchObject({
        code: PathErrorCode.NULL_BYTE
      });
    });

    it('throws when path is outside base directory', async () => {
      const baseDir = 'project/test-base';
      await expect(pathService.resolvePath('../outside.txt', { baseDir }))
        .rejects.toThrow(PathValidationError);
      await expect(pathService.resolvePath('../outside.txt', { baseDir }))
        .rejects.toMatchObject({
          code: PathErrorCode.OUTSIDE_BASE_DIR
        });
    });

    it('allows paths outside base directory when configured', async () => {
      const baseDir = 'project/test-base';
      const filePath = '/other/dir/file.txt';
      const resolved = await pathService.resolvePath(filePath, {
        baseDir,
        allowOutsideBaseDir: true
      });
      expect(resolved).toBe(filePath);
    });

    it('throws when path does not exist', async () => {
      await expect(pathService.resolvePath('nonexistent.txt'))
        .rejects.toThrow(PathValidationError);
      await expect(pathService.resolvePath('nonexistent.txt'))
        .rejects.toMatchObject({
          code: PathErrorCode.PATH_NOT_FOUND
        });
    });

    it('does not check existence when configured', async () => {
      const resolved = await pathService.resolvePath('nonexistent.txt', { mustExist: false });
      expect(resolved).toBe('project/nonexistent.txt');
    });

    it('validates file type', async () => {
      await expect(pathService.resolvePath('test-dir', { mustBeFile: true }))
        .rejects.toMatchObject({
          code: PathErrorCode.NOT_A_FILE
        });

      await expect(pathService.resolvePath('test-file.txt', { mustBeDirectory: true }))
        .rejects.toMatchObject({
          code: PathErrorCode.NOT_A_DIRECTORY
        });
    });

    it('validates that file exists', async () => {
      await context.fixtures.load('basicProject');
      await expect(
        pathService.validatePath('project/src/main.meld')
      ).resolves.not.toThrow();

      await expect(
        pathService.validatePath('project/src/nonexistent.meld')
      ).rejects.toThrow();
    });

    it('validates file is within project root', async () => {
      await context.fixtures.load('basicProject');
      await expect(
        pathService.validatePath('../outside.meld')
      ).rejects.toThrow();
    });
  });

  describe('Path variables', () => {
    beforeEach(async () => {
      await context.fixtures.load('pathVariablesProject');
    });

    it('expands path variables', async () => {
      pathService.setPathVariable('HOME', 'home/user');
      const resolved = await pathService.resolvePath('$HOME/file.txt', {
        allowOutsideBaseDir: true
      });
      expect(resolved).toBe('home/user/file.txt');
    });

    it('expands variables with braces', async () => {
      pathService.setPathVariable('HOME', 'home/user');
      const resolved = await pathService.resolvePath('${HOME}/file.txt', {
        allowOutsideBaseDir: true
      });
      expect(resolved).toBe('home/user/file.txt');
    });

    it('handles multiple variables in one path', async () => {
      pathService.setPathVariable('HOME', 'home/user');
      pathService.setPathVariable('PROJECT', 'project');
      const expanded = pathService.expandPathVariables('$HOME/$PROJECT/src/file.txt');
      expect(expanded).toBe('home/user/project/src/file.txt');
    });

    it('throws on invalid variable names', () => {
      expect(() => pathService.setPathVariable('', '/value'))
        .toThrow(PathValidationError);
      expect(() => pathService.setPathVariable('name', ''))
        .toThrow(PathValidationError);
    });

    it('clears and reinitializes variables', () => {
      pathService.setPathVariable('CUSTOM', 'value');
      expect(pathService.getPathVariable('CUSTOM')).toBe('value');

      pathService.clearPathVariables();
      expect(pathService.getPathVariable('CUSTOM')).toBeUndefined();
      expect(pathService.getPathVariable('HOME')).toBeDefined();
      expect(pathService.getPathVariable('PROJECTPATH')).toBeDefined();
    });
  });

  describe('Path validation helpers', () => {
    beforeEach(async () => {
      await context.fixtures.load('pathValidationProject');
    });

    it('checks if path is valid', async () => {
      expect(await pathService.isValidPath('project/test-file.txt'))
        .toBe(true);
      expect(await pathService.isValidPath('project/invalid.txt'))
        .toBe(false);
    });
  });

  describe('File operations', () => {
    beforeEach(async () => {
      await context.fixtures.load('basicProject');
    });

    it('reads file content', async () => {
      const content = await pathService.readFileContent('project/src/main.meld');
      expect(content).toContain('@text greeting = "Hello World"');
    });

    it('throws if file does not exist', async () => {
      await expect(
        pathService.readFileContent('project/src/nonexistent.meld')
      ).rejects.toThrow();
    });

    it('detects file modifications', async () => {
      // Take initial snapshot
      const before = context.takeSnapshot();

      // Modify a file
      context.fs.writeFile('project/src/main.meld', '@text greeting = "Modified"');

      // Take after snapshot and compare
      const after = context.takeSnapshot();
      const diff = context.compareSnapshots(before, after);

      expect(diff.modified).toContain('/project/src/main.meld');
      expect(diff.modifiedContents.get('/project/src/main.meld')).toBe('@text greeting = "Modified"');
    });
  });
}); 