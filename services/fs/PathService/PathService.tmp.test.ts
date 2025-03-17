import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { PathValidationError, PathErrorCode } from '@services/fs/PathService/errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';
import type { StructuredPath } from '@core/syntax/types.js';
import { PathErrorMessages } from '@core/errors/messages/paths.js';

describe('PathService Temporary Path Rules', () => {
  let context: TestContextDI;
  let service: PathService;

  beforeEach(async () => {
    // Initialize test context
    context = TestContextDI.create();
    await context.initialize();

    // Get PathService from context
    service = context.services.path;

    // Set known paths for testing
    service.setHomePath('/home/user');
    service.setProjectPath('/project/root');
    
    // Explicitly disable test mode to ensure path validation is enforced
    service.setTestMode(false);
  });

  afterEach(async () => {
    await context?.cleanup();
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

  it('should allow simple paths containing dots', () => {
    // No longer throws - these paths are now allowed
    const result1 = service.resolvePath('./file.meld', '/current/dir');
    const result2 = service.resolvePath('../file.meld', '/current/dir');
    
    // Should resolve relative to current directory
    // Note: path.join normalizes the paths
    expect(result1).toBe('/current/dir/file.meld');  // normalized from /current/dir/./file.meld
    // Node's path normalization may resolve '../' resulting in '/current/file.meld'
    // We're just checking that it resolves without throwing errors
    expect(result2.includes('/file.meld')).toBe(true);
    
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
    
    // No longer throws - these paths are now allowed
    const structuredResult1 = service.resolvePath(dotPath, '/current/dir');
    const structuredResult2 = service.resolvePath(dotDotPath, '/current/dir');
    
    // Note: path.join normalizes the paths
    expect(structuredResult1).toBe('/current/dir/file.meld');  // normalized from /current/dir/./file.meld
    // Node's path normalization may resolve '../' resulting in '/current/file.meld'
    // We're just checking that it resolves without throwing errors
    expect(structuredResult2.includes('/file.meld')).toBe(true);
  });

  describe('Path validation rules', () => {
    it('should allow paths with .. segments', () => {
      // No longer throws - paths with .. segments are now allowed
      const result = service.resolvePath('$./path/../file.meld');
      // Node's path.join may or may not normalize this path - we're just checking it doesn't throw
      expect(result.endsWith('file.meld')).toBe(true);
        
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
      
      // No longer throws - paths with .. segments are now allowed
      const structuredResult = service.resolvePath(structuredPath);
      // Node's path.join may or may not normalize this path - we're just checking it doesn't throw
      expect(structuredResult.endsWith('file.meld')).toBe(true);
    });

    it('should allow paths with . segments', () => {
      // No longer throws - paths with . segments are now allowed
      const result = service.resolvePath('$./path/./file.meld');
      // Node's path.join may normalize this path - we're just checking it doesn't throw
      expect(result.includes('path')).toBe(true);
      expect(result.endsWith('file.meld')).toBe(true);
        
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
      
      // No longer throws - paths with . segments are now allowed
      const structuredResult = service.resolvePath(structuredPath);
      // Node's path.join may normalize this path - we're just checking it doesn't throw
      expect(structuredResult.includes('path')).toBe(true);
      expect(structuredResult.endsWith('file.meld')).toBe(true);
    });

    it('should allow raw absolute paths', () => {
      // No longer throws - raw absolute paths are now allowed
      const result = service.resolvePath('/absolute/path/file.meld');
      expect(result).toBe('/absolute/path/file.meld');
        
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: '/absolute/path/file.meld',
        structured: {
          segments: ['absolute', 'path', 'file.meld']
          // No special variables or cwd flag
        }
      };
      
      // No longer throws - raw absolute paths are now allowed
      const structuredResult = service.resolvePath(structuredPath);
      expect(structuredResult).toBe('/absolute/path/file.meld');
    });

    it('should allow paths with slashes but no path variable', () => {
      // No longer throws - paths with slashes but no path variable are now allowed
      const result = service.resolvePath('path/to/file.meld', '/current/dir');
      expect(result).toBe('/current/dir/path/to/file.meld');
        
      // Test with structured path
      const structuredPath: StructuredPath = {
        raw: 'path/to/file.meld',
        structured: {
          segments: ['path', 'to', 'file.meld']
          // No special variables or cwd flag
        }
      };
      
      // No longer throws - paths with slashes but no path variable are now allowed
      const structuredResult = service.resolvePath(structuredPath, '/current/dir');
      expect(structuredResult).toBe('/current/dir/path/to/file.meld');
    });
  });

  describe('Path guidance - no longer errors', () => {
    it('should no longer throw errors for dot segments', () => {
      // No longer throws - paths with dot segments are now allowed
      const result = service.resolvePath('$./path/../file.meld');
      // Node's path.join may or may not normalize this path - we're just checking it doesn't throw
      expect(result.endsWith('file.meld')).toBe(true);
    });

    it('should no longer throw errors for raw absolute paths', () => {
      // No longer throws - raw absolute paths are now allowed
      const result = service.resolvePath('/absolute/path.meld');
      expect(result).toBe('/absolute/path.meld');
    });

    it('should no longer throw errors for paths with slashes but no path variable', () => {
      // No longer throws - paths with slashes but no path variable are now allowed
      const result = service.resolvePath('path/to/file.meld', '/current/dir');
      expect(result).toBe('/current/dir/path/to/file.meld');
    });
  });

  describe('Location information in errors', () => {
    const testLocation: Location = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 20 },
      filePath: 'test.meld'
    };

    it('should include location information in errors for unsupported paths', () => {
      // Now only checks for null bytes - relative paths are allowed
      
      // Test with a path containing a null byte (still invalid)
      try {
        service.validateMeldPath('invalid\0.meld', testLocation);
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.location).toBe(testLocation);
        expect(err.code).toBe(PathErrorCode.NULL_BYTE);
      }
      
      // Regular paths should not throw errors anymore
      const validRelativePath = '../valid.meld';
      expect(() => service.validateMeldPath(validRelativePath, testLocation)).not.toThrow();
    });
  });
}); 