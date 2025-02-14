import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../../tests/utils';
import { FileSystemService } from './FileSystemService';

describe('FileSystemService', () => {
  let context: TestContext;
  let service: FileSystemService;

  beforeEach(async () => {
    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Load test fixture
    await context.fixtures.load('fileSystemProject');

    // Initialize service with test filesystem
    service = new FileSystemService();
    service.enableTestMode();
    service.setTestFileSystem(context.fs);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('File operations', () => {
    it('writes and reads a file', async () => {
      const filePath = 'project/write-test.txt';
      const content = 'New content';

      await service.writeFile(filePath, content);
      const result = await service.readFile(filePath);

      expect(result).toBe(content);
    });

    it('reads an existing file', async () => {
      const content = await service.readFile('project/test.txt');
      expect(content).toBe('Hello, World!');
    });

    it('checks if a file exists', async () => {
      expect(await service.exists('project/exists.txt')).toBe(true);
      expect(await service.exists('project/nonexistent.txt')).toBe(false);
    });

    it('gets file stats', async () => {
      const stats = await service.stat('project/stats.txt');
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });

    it('throws when reading non-existent file', async () => {
      await expect(service.readFile('project/nonexistent.txt'))
        .rejects.toThrow();
    });

    it('creates parent directories when writing files', async () => {
      await service.writeFile('project/new/nested/file.txt', 'content');
      expect(await service.exists('project/new/nested/file.txt')).toBe(true);
      expect(await service.isDirectory('project/new/nested')).toBe(true);
    });
  });

  describe('Directory operations', () => {
    it('creates and verifies directory', async () => {
      const dirPath = 'project/new-dir';
      await service.ensureDir(dirPath);

      const exists = await service.exists(dirPath);
      const isDir = await service.isDirectory(dirPath);

      expect(exists).toBe(true);
      expect(isDir).toBe(true);
    });

    it('lists directory contents', async () => {
      const files = await service.readDir('project/list-dir');
      expect(files).toHaveLength(2);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('creates nested directories', async () => {
      const dirPath = 'project/a/b/c/d';
      await service.ensureDir(dirPath);
      expect(await service.isDirectory(dirPath)).toBe(true);
    });

    it('verifies empty directory', async () => {
      expect(await service.readDir('project/empty-dir')).toHaveLength(0);
    });
  });

  describe('Path operations', () => {
    it('joins paths', () => {
      expect(service.join('project', 'nested', 'file.txt'))
        .toBe('project/nested/file.txt');
    });

    it('resolves paths', () => {
      expect(service.resolve('project/nested', '../file.txt'))
        .toBe('project/file.txt');
    });

    it('gets dirname', () => {
      expect(service.dirname('project/nested/file.txt'))
        .toBe('project/nested');
    });

    it('gets basename', () => {
      expect(service.basename('project/nested/file.txt'))
        .toBe('file.txt');
    });

    it('normalizes paths', () => {
      expect(service.normalize('project/./nested/../file.txt'))
        .toBe('project/file.txt');
    });
  });

  describe('File type checking', () => {
    it('identifies directories', async () => {
      expect(await service.isDirectory('project/stats-dir')).toBe(true);
      expect(await service.isDirectory('project/stats.txt')).toBe(false);
    });

    it('identifies files', async () => {
      expect(await service.isFile('project/stats.txt')).toBe(true);
      expect(await service.isFile('project/stats-dir')).toBe(false);
    });

    it('handles non-existent paths', async () => {
      expect(await service.isFile('project/nonexistent')).toBe(false);
      expect(await service.isDirectory('project/nonexistent')).toBe(false);
    });
  });

  describe('Filesystem changes', () => {
    it('detects file modifications', async () => {
      // Take initial snapshot
      const before = context.takeSnapshot();

      // Modify a file
      await service.writeFile('project/test.txt', 'Modified content');

      // Take after snapshot and compare
      const after = context.takeSnapshot();
      const diff = context.compareSnapshots(before, after);

      expect(diff.modified).toContain('/project/test.txt');
      expect(diff.modifiedContents.get('/project/test.txt')).toBe('Modified content');
    });

    it('detects new files', async () => {
      const before = context.takeSnapshot();
      await service.writeFile('project/new-file.txt', 'New content');
      const after = context.takeSnapshot();
      const diff = context.compareSnapshots(before, after);

      expect(diff.added).toContain('/project/new-file.txt');
    });

    it('detects removed files', async () => {
      const before = context.takeSnapshot();
      await service.remove('project/test.txt');
      const after = context.takeSnapshot();
      const diff = context.compareSnapshots(before, after);

      expect(diff.removed).toContain('/project/test.txt');
    });
  });
}); 