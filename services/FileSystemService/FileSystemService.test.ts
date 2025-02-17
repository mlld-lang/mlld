import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { FileSystemService } from './FileSystemService.js';
import { PathOperationsService } from './PathOperationsService.js';
import { MeldError } from '@core/errors/MeldError.js';
import path from 'path';

describe('FileSystemService', () => {
  let context: TestContext;
  let service: FileSystemService;
  let pathOps: PathOperationsService;

  beforeEach(async () => {
    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Load test fixture
    await context.fixtures.load('fileSystemProject');

    // Initialize services
    pathOps = new PathOperationsService();
    service = new FileSystemService(pathOps, context.fs);

    // Set up test files and directories
    await service.ensureDir('project/list-dir');
    await service.writeFile('project/list-dir/file1.txt', 'content1');
    await service.writeFile('project/list-dir/file2.txt', 'content2');
    await service.writeFile('project/test.txt', 'Hello, World!');
    await service.writeFile('project/exists.txt', 'exists');
    await service.writeFile('project/stats.txt', 'stats');
    await service.ensureDir('project/stats-dir');
    await service.ensureDir('project/empty-dir');
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

    it('throws MeldError when reading non-existent file', async () => {
      await expect(service.readFile('project/nonexistent.txt'))
        .rejects.toThrow(MeldError);
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

    it('throws MeldError when reading non-existent directory', async () => {
      await expect(service.readDir('project/nonexistent'))
        .rejects.toThrow(MeldError);
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
      const before = await context.snapshot.takeSnapshot();

      // Modify a file
      await service.writeFile('project/test.txt', 'Modified content');

      // Take after snapshot and compare
      const after = await context.snapshot.takeSnapshot();
      const diff = context.snapshot.compare(before, after);

      expect(diff.modified).toContain('project/test.txt');
    });

    it('detects new files', async () => {
      const before = await context.snapshot.takeSnapshot();
      await service.writeFile('project/new-file.txt', 'New content');
      const after = await context.snapshot.takeSnapshot();
      const diff = context.snapshot.compare(before, after);

      expect(diff.added).toContain('project/new-file.txt');
    });

    it('detects removed files', async () => {
      // Note: We don't have a remove method in our interface yet
      // This test is a placeholder for when we add file removal support
      expect(true).toBe(true);
    });
  });
}); 