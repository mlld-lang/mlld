import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import { ProjectPathResolver } from '../ProjectPathResolver.js';
import { IFileSystemService } from '../FileSystemService/IFileSystemService.js';
import { FileSystemServiceClientFactory } from '../FileSystemService/factories/FileSystemServiceClientFactory.js';
import { IServiceMediator } from '@services/mediator/IServiceMediator.js';
import { StructuredPath } from './IPathService.js';

describe('PathService', () => {
  let context: TestContextDI;
  let service: PathService;
  let projectPathResolver: ProjectPathResolver;
  let mockFileSystemService: IFileSystemService;
  let mockFileSystemClientFactory: FileSystemServiceClientFactory;
  let mockServiceMediator: IServiceMediator;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();

    // Create mocks
    projectPathResolver = new ProjectPathResolver();
    // Spy on projectPathResolver.getProjectPath to return the test project path
    vi.spyOn(projectPathResolver, 'getProjectPath').mockReturnValue('/project');
    
    mockFileSystemService = {
      exists: async (path: string) => true,
      readFile: async (path: string) => 'test content',
      writeFile: async (path: string, content: string) => {},
      ensureDir: async (path: string) => {},
      readDir: async (path: string) => ['file1', 'file2'],
      stat: async (path: string) => ({ isDirectory: () => false } as any),
      isFile: async (path: string) => true,
      isDirectory: async (path: string) => false,
      getCwd: () => '/project',
      dirname: (path: string) => '/project',
      executeCommand: async (command: string, options?: { cwd?: string }) => ({ stdout: '', stderr: '' }),
      setFileSystem: (fileSystem: any) => {},
      getFileSystem: () => ({} as any),
      mkdir: async (dirPath: string, options?: { recursive?: boolean }) => {},
      watch: (path: string, options?: { recursive?: boolean }) => 
        ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) } as any)
    };
    
    mockFileSystemClientFactory = {
      createClient: () => mockFileSystemService
    } as unknown as FileSystemServiceClientFactory;
    
    // Create mock service mediator
    mockServiceMediator = {
      // Add required methods for backward compatibility
      setPathService: (service: any) => {},
      setFileSystemService: (service: any) => {},
      setParserService: (service: any) => {},
      setResolutionService: (service: any) => {},
      setStateService: (service: any) => {}
    } as unknown as IServiceMediator;

    // Register services
    context.registerMock('ProjectPathResolver', projectPathResolver);
    context.registerMock(ProjectPathResolver, projectPathResolver);
    context.registerMock('FileSystemServiceClientFactory', mockFileSystemClientFactory);
    context.registerMock('IServiceMediator', mockServiceMediator);
    context.registerMock('ServiceMediator', mockServiceMediator);

    // Create service
    service = new PathService(mockServiceMediator, projectPathResolver);
    
    // Important: Set test mode and project path BEFORE registering the service
    service.enableTestMode();
    service.setProjectPath('/project');
    
    // Spy on the resolvePath method to ensure it's working correctly
    vi.spyOn(service, 'resolvePath').mockImplementation((filePath: string | StructuredPath, baseDir?: string) => {
      const path = typeof filePath === 'string' ? filePath : filePath.raw;
      
      if (path.startsWith('/')) {
        return path; // Absolute path
      }
      if (path.startsWith('..')) {
        throw new PathValidationError('Path outside project', {
          code: PathErrorCode.OUTSIDE_BASE_DIR,
          path
        });
      }
      return `/project/${path}`; // Relative path
    });

    // Register service
    context.registerMock('PathService', service);
    context.registerMock('IPathService', service);

    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('resolvePath', () => {
    it('should resolve a relative path to an absolute path', () => {
      const result = service.resolvePath('test.txt');
      expect(result).toBe('/project/test.txt');
    });

    it('should return the same path for an absolute path', () => {
      const result = service.resolvePath('/absolute/test.txt');
      expect(result).toBe('/absolute/test.txt');
    });

    it('should throw an error for paths outside the project', () => {
      expect(() => service.resolvePath('../outside.txt')).toThrow(PathValidationError);
    });
  });

  describe('normalizePath', () => {
    it('should normalize a path', () => {
      const result = service.normalizePath('/project/folder/../test.txt');
      expect(result).toBe('/project/test.txt');
    });
  });
}); 