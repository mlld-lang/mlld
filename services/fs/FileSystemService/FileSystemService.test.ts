import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { container, DependencyContainer } from 'tsyringe';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import type { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService';
import { MeldError } from '@core/errors/MeldError';
import path from 'path';
import type { PathService } from '@services/fs/PathService/PathService';
import type { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory';
import type { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient';
import fs from 'fs-extra';

describe('FileSystemService', () => {
  let testContainer: DependencyContainer;
  let service: IFileSystemService;
  let memFs: MemfsTestFileSystem;
  let mockPathOps: DeepMockProxy<IPathOperationsService>;
  let mockPathClient: DeepMockProxy<IPathServiceClient>;
  let mockPathClientFactory: DeepMockProxy<PathServiceClientFactory>;

  beforeEach(async () => {
    testContainer = container.createChildContainer();

    memFs = new MemfsTestFileSystem();
    mockPathOps = mockDeep<IPathOperationsService>();
    mockPathClient = mockDeep<IPathServiceClient>();
    mockPathClientFactory = mockDeep<PathServiceClientFactory>();

    mockPathClientFactory.createClient.mockReturnValue(mockPathClient);
    mockPathClient.resolvePath.mockImplementation((filePath) => {
        const pathString = typeof filePath === 'string' ? filePath : filePath.raw;
        return path.resolve(pathString);
    });
    mockPathClient.normalizePath.mockImplementation((filePath) => path.normalize(filePath));

    testContainer.registerInstance<IFileSystem>('IFileSystem', memFs);
    testContainer.registerInstance<IPathOperationsService>('IPathOperationsService', mockPathOps);
    testContainer.registerInstance(PathServiceClientFactory, mockPathClientFactory);
    testContainer.registerInstance('ILogger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    
    testContainer.registerInstance('DependencyContainer', testContainer);

    testContainer.register<IFileSystemService>('IFileSystemService', { useClass: FileSystemService });

    service = testContainer.resolve<IFileSystemService>('IFileSystemService');
    
    await memFs.ensureDir('/project');
    await memFs.ensureDir('/project/list-dir');
    await memFs.writeFile('/project/list-dir/file1.txt', 'content1');
    await memFs.writeFile('/project/list-dir/file2.txt', 'content2');
    await memFs.writeFile('/project/test.txt', 'Hello, World!');
    await memFs.writeFile('/project/exists.txt', 'exists');
    await memFs.writeFile('/project/stats.txt', 'stats');
    await memFs.ensureDir('/project/stats-dir');
    await memFs.ensureDir('/project/empty-dir');
  });

  afterEach(async () => {
    testContainer?.dispose();
    if (memFs) {
      memFs.vol.reset();
    }
    vi.resetAllMocks();
  });

  describe('File operations', () => {
    it('writes and reads a file', async () => {
      const filePath = '/project/write-test.txt';
      const content = 'New content';

      await service.writeFile(filePath, content);
      const result = await service.readFile(filePath);

      expect(result).toBe(content);
    });

    it('reads an existing file', async () => {
      const content = await service.readFile('/project/test.txt');
      expect(content).toBe('Hello, World!');
    });

    it('checks if a file exists', async () => {
      expect(await service.exists('/project/exists.txt')).toBe(true);
      expect(await service.exists('/project/nonexistent.txt')).toBe(false);
    });

    it('gets file stats', async () => {
      const stats = await service.stat('/project/stats.txt');
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });

    it('throws MeldError when reading non-existent file', async () => {
      await expect(service.readFile('/project/nonexistent.txt'))
        .rejects.toThrow(MeldError);
    });

    it('creates parent directories when writing files', async () => {
      const filePath = '/project/new/nested/file.txt';
      const dirPath = '/project/new/nested';
      await service.writeFile(filePath, 'content');
      expect(await service.exists(filePath)).toBe(true);
      expect(await service.isDirectory(dirPath)).toBe(true);
    });
  });

  describe('Directory operations', () => {
    it('creates and verifies directory', async () => {
      const dirPath = '/project/new-dir';
      await service.ensureDir(dirPath);

      const exists = await service.exists(dirPath);
      const isDir = await service.isDirectory(dirPath);

      expect(exists).toBe(true);
      expect(isDir).toBe(true);
    });

    it('lists directory contents', async () => {
      const files = await service.readDir('/project/list-dir');
      expect(files).toHaveLength(2);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('creates nested directories', async () => {
      const dirPath = '/project/a/b/c/d';
      await service.ensureDir(dirPath);
      expect(await service.isDirectory(dirPath)).toBe(true);
    });

    it('verifies empty directory', async () => {
      expect(await service.readDir('/project/empty-dir')).toHaveLength(0);
    });

    it('throws MeldError when reading non-existent directory', async () => {
      await expect(service.readDir('/project/nonexistent'))
        .rejects.toThrow(MeldError);
    });
  });

  describe('File type checking', () => {
    it('identifies directories', async () => {
      expect(await service.isDirectory('/project/stats-dir')).toBe(true);
      expect(await service.isDirectory('/project/stats.txt')).toBe(false);
    });

    it('identifies files', async () => {
      expect(await service.isFile('/project/stats.txt')).toBe(true);
      expect(await service.isFile('/project/stats-dir')).toBe(false);
    });

    it('handles non-existent paths', async () => {
      expect(await service.isFile('/project/nonexistent')).toBe(false);
      expect(await service.isDirectory('/project/nonexistent')).toBe(false);
    });
  });

  describe('File modification handling', () => {
    it('updates file content correctly', async () => {
      await service.writeFile('/project/test.txt', 'Modified content');
      
      const modifiedContent = await service.readFile('/project/test.txt');
      expect(modifiedContent).toBe('Modified content');
    });

    it('creates new files correctly', async () => {
      await service.writeFile('/project/new-file.txt', 'New content');
      
      const exists = await service.exists('/project/new-file.txt');
      expect(exists).toBe(true);
      
      const content = await service.readFile('/project/new-file.txt');
      expect(content).toBe('New content');
    });
  });
}); 