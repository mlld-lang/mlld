import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';
import type { MeldNode } from 'meld-spec';
import { StructuredPath } from './IPathService.js';

// Mock ParserService implementation
const createMockParserService = () => ({
  parse: vi.fn(async (content: string) => {
    // Create simple mock nodes for path strings
    if (content.startsWith('$~/') || content.startsWith('$HOMEPATH/')) {
      return [{
        type: 'PathVar',
        value: {
          raw: content,
          structured: {
            segments: content.split('/').slice(1).filter(Boolean),
            variables: {
              special: ['HOMEPATH'],
              path: []
            }
          }
        }
      }] as MeldNode[];
    } else if (content.startsWith('$./') || content.startsWith('$PROJECTPATH/')) {
      return [{
        type: 'PathVar',
        value: {
          raw: content,
          structured: {
            segments: content.split('/').slice(1).filter(Boolean),
            variables: {
              special: ['PROJECTPATH'],
              path: []
            }
          }
        }
      }] as MeldNode[];
    } else if (content.includes('/')) {
      return [{
        type: 'PathVar',
        value: {
          raw: content,
          structured: {
            segments: content.split('/').filter(Boolean),
            cwd: true
          }
        }
      }] as MeldNode[];
    } else {
      return [{
        type: 'PathVar',
        value: {
          raw: content,
          structured: {
            segments: [content],
            cwd: true
          }
        }
      }] as MeldNode[];
    }
  }),
  parseWithLocations: vi.fn()
});

describe('PathService', () => {
  let context: TestContext;
  let service: PathService;
  let mockParserService: ReturnType<typeof createMockParserService>;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    service = context.services.path;
    mockParserService = createMockParserService();
    service.initialize(context.services.fs, mockParserService);
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

  describe('Structured path validation', () => {
    it('validates structured paths correctly', async () => {
      // Create a structured path for a home-relative path
      const homeStructuredPath = {
        raw: '$~/path/to/file.txt',
        structured: {
          segments: ['path', 'to', 'file.txt'],
          variables: {
            special: ['HOMEPATH'],
            path: []
          }
        }
      };

      // Create a structured path for a project-relative path
      const projectStructuredPath = {
        raw: '$./path/to/file.txt',
        structured: {
          segments: ['path', 'to', 'file.txt'],
          variables: {
            special: ['PROJECTPATH'],
            path: []
          }
        }
      };

      // Create a simple structured path (no slashes)
      const simpleStructuredPath = {
        raw: 'file.txt',
        structured: {
          segments: ['file.txt'],
          cwd: true
        }
      };

      // Create a structured path with dot segments (should be rejected)
      const dotStructuredPath = {
        raw: '$./path/../file.txt',
        structured: {
          segments: ['path', '..', 'file.txt'],
          variables: {
            special: ['PROJECTPATH'],
            path: []
          }
        }
      };

      // Test valid structured paths
      expect(() => service.resolvePath(homeStructuredPath)).not.toThrow();
      expect(() => service.resolvePath(projectStructuredPath)).not.toThrow();
      expect(() => service.resolvePath(simpleStructuredPath)).not.toThrow();

      // Test invalid structured path with dot segments
      expect(() => service.resolvePath(dotStructuredPath)).toThrow(PathValidationError);
    });

    it('uses parser service when available', async () => {
      // Test a path string that should be parsed
      await service.validatePath('$./test.txt', { mustExist: false });
      
      // Verify parser was called
      expect(mockParserService.parse).toHaveBeenCalled();
    });
  });

  describe('Regression tests for specific failures', () => {
    it('validates path is within base directory correctly', async () => {
      const filePath = '$./inside.txt';
      const outsidePath = '$~/outside.txt';
      
      // Create test files
      await context.fs.writeFile('/project/root/inside.txt', 'test');
      await context.fs.writeFile('/home/user/outside.txt', 'test');

      // Should pass for path within base dir
      await expect(service.validatePath(filePath, {
        allowOutsideBaseDir: false
      })).resolves.not.toThrow();

      // Should fail for path outside base dir
      await expect(service.validatePath(outsidePath, {
        allowOutsideBaseDir: false
      })).rejects.toThrow(PathValidationError);
    });
    
    it('validates file existence correctly', async () => {
      const filePath = '$./test.txt';
      
      // Create test file
      await context.fs.writeFile('/project/root/test.txt', 'test');

      // Should pass for existing file
      await expect(service.validatePath(filePath, {
        mustExist: true
      })).resolves.not.toThrow();

      // Should fail for non-existent file
      await expect(service.validatePath('$./nonexistent.txt', {
        mustExist: true
      })).rejects.toThrow(PathValidationError);
    });
    
    it('validates file type correctly', async () => {
      const filePath = '$./test.txt';
      const dirPath = '$./testdir';
      
      // Create test file and directory
      await context.fs.writeFile('/project/root/test.txt', 'test');
      await context.fs.mkdir('/project/root/testdir');

      // Should pass for file when mustBeFile is true
      await expect(service.validatePath(filePath, {
        mustBeFile: true
      })).resolves.not.toThrow();

      // Should fail for directory when mustBeFile is true
      await expect(service.validatePath(dirPath, {
        mustBeFile: true
      })).rejects.toThrow(PathValidationError);
    });
  });
}); 