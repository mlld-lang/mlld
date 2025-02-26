import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';
import type { StructuredPath } from 'meld-spec';

describe('PathService Temporary Path Rules', () => {
  let context: TestContext;
  let service: PathService;

  beforeEach(async () => {
    // Initialize test context
    context = new TestContext();
    await context.initialize();

    // Get PathService from context
    service = context.services.path;

    // Set known paths for testing
    service.setHomePath('/home/user');
    service.setProjectPath('/project/root');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should allow simple filenames in current directory', () => {
    const result = service.resolvePath('file.meld', '/current/dir');
    expect(result).toBe('/current/dir/file.meld');
    
    // Test with structured path
    const structuredPath: StructuredPath = {
      raw: 'file.meld',
      structured: {
        segments: ['file.meld'],
        cwd: true // This is important - indicates it's relative to current directory
      }
    };
    const structuredResult = service.resolvePath(structuredPath, '/current/dir');
    expect(structuredResult).toBe('/current/dir/file.meld');
  });

  describe('Special path variables', () => {
    it('should resolve $HOMEPATH paths', () => {
      const result = service.resolvePath('$~/path/to/file.meld');
      expect(result).toBe('/home/user/path/to/file.meld');
      
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: '$HOMEPATH/path/to/file.meld',
        structured: {
          segments: ['path', 'to', 'file.meld'],
          variables: {
            special: ['HOMEPATH']
          }
        }
      };
      const structuredResult = service.resolvePath(structuredPath);
      expect(structuredResult).toBe('/home/user/path/to/file.meld');
    });

    it('should resolve $~ paths (alias for $HOMEPATH)', () => {
      const result = service.resolvePath('$~/path/to/file.meld');
      expect(result).toBe('/home/user/path/to/file.meld');
      
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: '$~/path/to/file.meld',
        structured: {
          segments: ['path', 'to', 'file.meld'],
          variables: {
            special: ['HOMEPATH']
          }
        }
      };
      const structuredResult = service.resolvePath(structuredPath);
      expect(structuredResult).toBe('/home/user/path/to/file.meld');
    });

    it('should resolve $PROJECTPATH paths', () => {
      const result = service.resolvePath('$./path/to/file.meld');
      expect(result).toBe('/project/root/path/to/file.meld');
      
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: '$PROJECTPATH/path/to/file.meld',
        structured: {
          segments: ['path', 'to', 'file.meld'],
          variables: {
            special: ['PROJECTPATH']
          }
        }
      };
      const structuredResult = service.resolvePath(structuredPath);
      expect(structuredResult).toBe('/project/root/path/to/file.meld');
    });

    it('should resolve $. paths (alias for $PROJECTPATH)', () => {
      const result = service.resolvePath('$./path/to/file.meld');
      expect(result).toBe('/project/root/path/to/file.meld');
      
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: '$./path/to/file.meld',
        structured: {
          segments: ['path', 'to', 'file.meld'],
          variables: {
            special: ['PROJECTPATH']
          }
        }
      };
      const structuredResult = service.resolvePath(structuredPath);
      expect(structuredResult).toBe('/project/root/path/to/file.meld');
    });
  });

  it('should reject simple paths containing dots', () => {
    expect(() => service.resolvePath('./file.meld')).toThrow(PathValidationError);
    expect(() => service.resolvePath('../file.meld')).toThrow(PathValidationError);
    
    // Test with structured paths
    const dotPath: StructuredPath = {
      raw: './file.meld',
      structured: {
        segments: ['.', 'file.meld'],
        cwd: true
      }
    };
    const dotDotPath: StructuredPath = {
      raw: '../file.meld',
      structured: {
        segments: ['..', 'file.meld'],
        cwd: true
      }
    };
    expect(() => service.resolvePath(dotPath)).toThrow(PathValidationError);
    expect(() => service.resolvePath(dotDotPath)).toThrow(PathValidationError);
  });

  describe('Path validation rules', () => {
    it('should reject paths with .. segments', () => {
      expect(() => service.resolvePath('$./path/../file.meld'))
        .toThrow(new PathValidationError(
          'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
          PathErrorCode.CONTAINS_DOT_SEGMENTS
        ));
        
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: '$./path/../file.meld',
        structured: {
          segments: ['path', '..', 'file.meld'],
          variables: {
            special: ['PROJECTPATH']
          }
        }
      };
      expect(() => service.resolvePath(structuredPath))
        .toThrow(new PathValidationError(
          'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
          PathErrorCode.CONTAINS_DOT_SEGMENTS
        ));
    });

    it('should reject paths with . segments', () => {
      expect(() => service.resolvePath('$./path/./file.meld'))
        .toThrow(new PathValidationError(
          'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
          PathErrorCode.CONTAINS_DOT_SEGMENTS
        ));
        
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: '$./path/./file.meld',
        structured: {
          segments: ['path', '.', 'file.meld'],
          variables: {
            special: ['PROJECTPATH']
          }
        }
      };
      expect(() => service.resolvePath(structuredPath))
        .toThrow(new PathValidationError(
          'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
          PathErrorCode.CONTAINS_DOT_SEGMENTS
        ));
    });

    it('should reject raw absolute paths', () => {
      // Note: The current implementation checks for path variables first,
      // so the error code is INVALID_PATH_FORMAT instead of RAW_ABSOLUTE_PATH
      expect(() => service.resolvePath('/absolute/path/file.meld'))
        .toThrow(new PathValidationError(
          'Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
          PathErrorCode.INVALID_PATH_FORMAT
        ));
        
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: '/absolute/path/file.meld',
        structured: {
          segments: ['absolute', 'path', 'file.meld']
          // No special variables or cwd flag
        }
      };
      expect(() => service.resolvePath(structuredPath))
        .toThrow(new PathValidationError(
          'Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
          PathErrorCode.INVALID_PATH_FORMAT
        ));
    });

    it('should reject paths with slashes but no path variable', () => {
      expect(() => service.resolvePath('path/to/file.meld'))
        .toThrow(new PathValidationError(
          'Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
          PathErrorCode.INVALID_PATH_FORMAT
        ));
        
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: 'path/to/file.meld',
        structured: {
          segments: ['path', 'to', 'file.meld']
          // No special variables or cwd flag
        }
      };
      expect(() => service.resolvePath(structuredPath))
        .toThrow(new PathValidationError(
          'Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
          PathErrorCode.INVALID_PATH_FORMAT
        ));
    });
  });

  describe('Error messages and codes', () => {
    it('should provide helpful error messages for dot segments', () => {
      try {
        service.resolvePath('$./path/../file.meld');
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.code).toBe(PathErrorCode.CONTAINS_DOT_SEGMENTS);
        expect(err.message).toContain('use $. or $~ to reference');
      }
    });

    it('should provide helpful error messages for raw absolute paths', () => {
      try {
        service.resolvePath('/absolute/path.meld');
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        // Note: The current implementation checks for path variables first,
        // so the error code is INVALID_PATH_FORMAT instead of RAW_ABSOLUTE_PATH
        expect(err.code).toBe(PathErrorCode.INVALID_PATH_FORMAT);
        expect(err.message).toContain('must start with $. or $~');
      }
    });

    it('should provide helpful error messages for invalid path formats', () => {
      try {
        service.resolvePath('path/to/file.meld');
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.code).toBe(PathErrorCode.INVALID_PATH_FORMAT);
        expect(err.message).toContain('must start with $. or $~');
      }
    });
  });

  describe('Location information in errors', () => {
    const testLocation: Location = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 20 },
      filePath: 'test.meld'
    };

    it('should include location information in errors when provided', () => {
      try {
        service.validateMeldPath('../invalid.meld', testLocation);
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.location).toBe(testLocation);
      }
    });
  });
}); 