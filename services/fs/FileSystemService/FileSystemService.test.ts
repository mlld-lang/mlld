import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import type { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient.js';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import fs from 'fs-extra';

describe('FileSystemService', () => {
  let context: TestContextDI;
  let service: FileSystemService;
  let pathOps: PathOperationsService;
  let pathService: PathService;
  let projectPathResolver: ProjectPathResolver;
  let mockPathClient: IPathServiceClient;
  let mockPathClientFactory: PathServiceClientFactory;
  let mockFileSystemClient: any;
  let mockFileSystemClientFactory: FileSystemServiceClientFactory;

  beforeEach(async () => {
    // Initialize test context with isolated container
    context = TestContextDI.createIsolated();
    await context.initialize();

    // Load test fixture
    await context.fixtures.load('fileSystemProject');

    // Create test services with proper DI
    pathOps = new PathOperationsService();
    projectPathResolver = new ProjectPathResolver();
    
    // Create mock path client and factory
    mockPathClient = {
      resolvePath: (path: string) => path,
      normalizePath: (path: string) => path
    };
    
    mockPathClientFactory = {
      createClient: () => mockPathClient
    } as unknown as PathServiceClientFactory;
    
    // Create mock FileSystem client and factory
    mockFileSystemClient = {
      isDirectory: async (path: string) => path.endsWith('dir') || path.endsWith('directory'),
      exists: async (path: string) => true
    };
    
    mockFileSystemClientFactory = {
      createClient: () => mockFileSystemClient
    } as unknown as FileSystemServiceClientFactory;
    
    // Register services with container using the correct methods
    context.registerMock('IPathOperationsService', pathOps);
    context.registerMock('PathOperationsService', pathOps);
    context.registerMock(ProjectPathResolver, projectPathResolver);
    context.registerMock('IFileSystem', context.fs);
    context.registerMock('PathServiceClientFactory', mockPathClientFactory);
    context.registerMock('FileSystemServiceClientFactory', mockFileSystemClientFactory);
    
    // Create path service - now without ServiceMediator
    pathService = new PathService(projectPathResolver);
    pathService.enableTestMode();
    pathService.setProjectPath('/project');
    context.registerMock('IPathService', pathService);
    context.registerMock('PathService', pathService);
    
    // Initialize the context
    await context.initialize();
    
    // Resolve file system service from container with await for proper initialization
    service = await context.resolve(FileSystemService);

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

  describe('File modification handling', () => {
    it('updates file content correctly', async () => {
      // Modify a file
      await service.writeFile('project/test.txt', 'Modified content');
      
      // Verify modification happened
      const modifiedContent = await service.readFile('project/test.txt');
      expect(modifiedContent).toBe('Modified content');
    });

    it('creates new files correctly', async () => {
      // Create new file
      await service.writeFile('project/new-file.txt', 'New content');
      
      // Verify file was created
      const exists = await service.exists('project/new-file.txt');
      expect(exists).toBe(true);
      
      // Verify content was written correctly
      const content = await service.readFile('project/new-file.txt');
      expect(content).toBe('New content');
    });

    // Note: We can add a test for file removal if/when that functionality is needed
  });
}); 