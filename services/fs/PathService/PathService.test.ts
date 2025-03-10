import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';
import type { MeldNode } from 'meld-spec';
import { StructuredPath, IPathService } from './IPathService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { ProjectPathResolver } from '../ProjectPathResolver.js';
import { ServiceMediator } from '@services/mediator/ServiceMediator.js';
import { FileSystemService } from '../FileSystemService/FileSystemService.js';
import { PathOperationsService } from '../FileSystemService/PathOperationsService.js';

// Direct usage of meld-ast instead of a mock
const createRealParserService = () => {
  // Create the parse function
  const parseFunction = async (content: string): Promise<MeldNode[]> => {
    // Check if this is a path directive we need to handle specially
    if (content.includes('$PROJECTPATH/') || content.includes('$HOMEPATH/')) {
      // Extract the path from the content
      const pathMatch = content.match(/\$(PROJECTPATH|HOMEPATH)\/([^$\s]+)/);
      if (pathMatch) {
        const base = `$${pathMatch[1]}`;
        const path = `${base}/${pathMatch[2]}`;
        const segments = pathMatch[2].split('/');
        
        // Create a structured path node that matches the interface
        return [{
          type: 'PathVar',
          // Cast to any to avoid type errors with MeldNode
          value: {
            raw: path,
            structured: {
              segments,
              variables: {
                special: [pathMatch[1]]
              }
            },
            normalized: path
          } as StructuredPath,
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: content.length }
          }
        } as any];
      }
    }
    
    // Use the real meld-ast parser with dynamic import for other cases
    try {
      const { parse } = await import('meld-ast');
      const result = await parse(content, {
        trackLocations: true,
        validateNodes: true,
        // structuredPaths is used in the codebase but may be missing from typings
        // @ts-expect-error - structuredPaths is used but may be missing from typings
        structuredPaths: true
      });
      return result.ast || [];
    } catch (error) {
      console.error('Error parsing with meld-ast:', error);
      throw error;
    }
  };
  
  // Return a mock parser service
  return {
    parse: parseFunction
  };
};

describe('PathService', () => {
  let context: TestContextDI;
  let service: PathService;
  let fs: IFileSystemService & {
    exists: ReturnType<typeof vi.fn>;
    isDirectory: ReturnType<typeof vi.fn>;
    isFile: ReturnType<typeof vi.fn>;
  };
  let fileSystemService: FileSystemService;
  let parserService: any;
  let serviceMediator: ServiceMediator;
  let projectPathResolver: ProjectPathResolver;
  let pathOps: PathOperationsService;

  beforeEach(async () => {
    // Use isolated container for DI tests
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Set up mocks
    fs = {
      exists: vi.fn().mockImplementation(async (path: string) => {
        // Return true for test files, false for nonexistent files
        return path.includes('testfile.txt') || path.includes('testdir');
      }),
      isDirectory: vi.fn().mockImplementation(async (path: string) => {
        return path.includes('testdir');
      }),
      isFile: vi.fn().mockImplementation(async (path: string) => {
        return path.includes('testfile.txt');
      }),
      isAbsolutePath: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      deleteFile: vi.fn(),
      watch: vi.fn()
    } as unknown as IFileSystemService & {
      exists: ReturnType<typeof vi.fn>;
      isDirectory: ReturnType<typeof vi.fn>;
      isFile: ReturnType<typeof vi.fn>;
    };
    
    // Create service mediator and services
    serviceMediator = new ServiceMediator();
    projectPathResolver = new ProjectPathResolver();
    pathOps = new PathOperationsService();
    
    // Register dependencies with the DI container
    context.registerMock('IFileSystemService', fs);
    context.registerMock('IServiceMediator', serviceMediator);
    context.registerMock('ServiceMediator', serviceMediator);
    context.registerMock(ProjectPathResolver, projectPathResolver);
    context.registerMock('IPathOperationsService', pathOps);
    context.registerMock('PathOperationsService', pathOps);
    context.registerMock('IFileSystem', fs);
    
    // Create the actual PathService instance using DI
    service = new PathService(serviceMediator, projectPathResolver);
    service.setTestMode(true);
    
    // Create FileSystemService
    fileSystemService = new FileSystemService(pathOps, serviceMediator, fs);
    
    // Register services with the container and mediator
    context.registerMock('IPathService', service);
    context.registerMock('PathService', service);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('FileSystemService', fileSystemService);
    
    // Connect services through mediator
    serviceMediator.setPathService(service);
    serviceMediator.setFileSystemService(fileSystemService);
    
    // Create test files and dirs
    fs.exists('$PROJECTPATH/testfile.txt');
    fs.exists('$PROJECTPATH/testdir');
    fs.isDirectory('$PROJECTPATH/testdir');
    fs.isFile('$PROJECTPATH/testfile.txt');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Path validation', () => {
    it('validates empty path', async () => {
      // Use property checks instead of instanceof to avoid module identity issues
      await expect(service.validatePath('')).rejects.toMatchObject({
        name: 'PathValidationError'
      });
    });

    it('validates path with null bytes', async () => {
      await expect(service.validatePath('test\0.txt')).rejects.toMatchObject({
        name: 'PathValidationError'
      });
    });

    it('validates path is within base directory', async () => {
      const filePath = '$PROJECTPATH/test.txt';
      const outsidePath = '$HOMEPATH/outside.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // The actual method will resolve $PROJECTPATH to /project/root in test mode
      const resolvedPath = '/project/root/test.txt';

      // Test path within base dir
      await expect(service.validatePath(filePath, {
        allowOutsideBaseDir: false,
        location
      })).resolves.toBe(resolvedPath);

      // Test path outside base dir
      await expect(service.validatePath(outsidePath, {
        allowOutsideBaseDir: false,
        location
      })).rejects.toMatchObject({
        name: 'PathValidationError'
      });
    });

    it('allows paths outside base directory when configured', async () => {
      const outsidePath = '$HOMEPATH/outside.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // The actual method will resolve $HOMEPATH to /home/user in test mode
      const resolvedPath = '/home/user/outside.txt';

      // Test path outside base dir
      await expect(service.validatePath(outsidePath, {
        allowOutsideBaseDir: true,
        location
      })).resolves.toBe(resolvedPath);
    });

    it('validates file existence', async () => {
      const filePath = '$PROJECTPATH/testfile.txt';
      const nonExistentPath = '$PROJECTPATH/nonexistent.txt';
      const location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };
      
      // Create test file
      fs.exists.mockImplementation(async (path: string) => {
        return path.includes('testfile.txt');
      });
      
      // Should pass for existing file
      await expect(service.validatePath(filePath, {
        mustExist: true,
        location
      })).resolves.toBe('/project/root/testfile.txt');

      // Should fail for non-existent file
      await expect(service.validatePath(nonExistentPath, {
        mustExist: true,
        location
      })).rejects.toMatchObject({
        name: 'PathValidationError'
      });
    });

    it('skips existence check when configured', async () => {
      const nonExistentPath = '$PROJECTPATH/nonexistent.txt';
      const location: Location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };

      // Should pass for non-existent file when mustExist is false
      await expect(service.validatePath(nonExistentPath, {
        mustExist: false,
        location
      })).resolves.toBe('/project/root/nonexistent.txt');
    });

    it('validates file type', async () => {
      const filePath = '$PROJECTPATH/testfile.txt';
      const dirPath = '$PROJECTPATH/testdir';
      const location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };
      
      // Setup mock responses
      fs.isFile.mockImplementation(async (path: string) => {
        return path.includes('testfile.txt');
      });
      
      fs.isDirectory.mockImplementation(async (path: string) => {
        return path.includes('testdir');
      });
      
      // Should pass for file when mustBeFile is true
      await expect(service.validatePath(filePath, {
        mustBeFile: true,
        location
      })).resolves.toBe('/project/root/testfile.txt');

      // Should fail for directory when mustBeFile is true
      await expect(service.validatePath(dirPath, {
        mustBeFile: true,
        location
      })).rejects.toMatchObject({
        name: 'PathValidationError'
      });

      // Should pass for directory when mustBeDirectory is true
      await expect(service.validatePath(dirPath, {
        mustBeDirectory: true,
        location
      })).resolves.toBe('/project/root/testdir');

      // Should fail for file when mustBeDirectory is true
      await expect(service.validatePath(filePath, {
        mustBeDirectory: true,
        location
      })).rejects.toMatchObject({
        name: 'PathValidationError'
      });
    });
  });

  describe('Path normalization', () => {
    it('normalizes paths', () => {
      expect(service.normalizePath('/path/to/file.txt')).toBe('/path/to/file.txt');
      expect(service.normalizePath('/path//to/file.txt')).toBe('/path/to/file.txt');
      expect(service.normalizePath('/path/to/../file.txt')).toBe('/path/file.txt');
      expect(service.normalizePath('/path/./to/file.txt')).toBe('/path/to/file.txt');
    });

    it('gets basename', () => {
      expect(service.basename('/path/to/file.txt')).toBe('file.txt');
      expect(service.basename('file.txt')).toBe('file.txt');
    });
  });
}); 