import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { MeldError } from '@core/errors/MeldError.js';
import path from 'path';
import { PathService } from '@services/fs/PathService/PathService.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService.js';
import fs from 'fs-extra';

describe('FileSystemService', () => {
  const helpers = TestContextDI.createTestHelpers();
  let context: TestContextDI;
  let service: FileSystemService;
  let pathOps: PathOperationsService;
  let pathService: PathService;
  let projectPathResolver: ProjectPathResolver;

  beforeEach(async () => {
    context = helpers.setupWithStandardMocks({}, { isolatedContainer: true });
    await context.resolve('IPathService');

    await context.fixtures.load('fileSystemProject');

    service = await context.resolve(FileSystemService);
    pathOps = await context.resolve('IPathOperationsService');
    pathService = await context.resolve(PathService);
    projectPathResolver = await context.resolve(ProjectPathResolver);
    
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
    await context?.cleanup();
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
      const filePath = 'project/new/nested/file.txt';
      const dirPath = 'project/new/nested';
      await service.writeFile(filePath, 'content');
      expect(await service.exists(filePath)).toBe(true);
      expect(await service.isDirectory(dirPath)).toBe(true);
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

  describe('File modification handling', () => {
    it('updates file content correctly', async () => {
      await service.writeFile('project/test.txt', 'Modified content');
      
      const modifiedContent = await service.readFile('project/test.txt');
      expect(modifiedContent).toBe('Modified content');
    });

    it('creates new files correctly', async () => {
      await service.writeFile('project/new-file.txt', 'New content');
      
      const exists = await service.exists('project/new-file.txt');
      expect(exists).toBe(true);
      
      const content = await service.readFile('project/new-file.txt');
      expect(content).toBe('New content');
    });
  });
}); 