import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/TestContext.js';
import { PathService } from './PathService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';

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

  it.skip('should allow simple filenames in current directory', () => {
    const result = service.resolvePath('file.meld', '/current/dir');
    expect(result).toBe('/current/dir/file.meld');
  });

  describe.skip('Special path variables', () => {
    it('should resolve $HOMEPATH paths', () => {
      const result = service.resolvePath('$HOMEPATH/path/to/file.meld');
      expect(result).toBe('/home/user/path/to/file.meld');
    });

    it('should resolve $~ paths (alias for $HOMEPATH)', () => {
      const result = service.resolvePath('$~/path/to/file.meld');
      expect(result).toBe('/home/user/path/to/file.meld');
    });

    it('should resolve $PROJECTPATH paths', () => {
      const result = service.resolvePath('$PROJECTPATH/path/to/file.meld');
      expect(result).toBe('/project/root/path/to/file.meld');
    });

    it('should resolve $. paths (alias for $PROJECTPATH)', () => {
      const result = service.resolvePath('$./path/to/file.meld');
      expect(result).toBe('/project/root/path/to/file.meld');
    });
  });

  it.skip('should reject simple paths containing dots', () => {
    expect(() => service.resolvePath('./file.meld')).toThrow(PathValidationError);
    expect(() => service.resolvePath('../file.meld')).toThrow(PathValidationError);
  });

  describe('Path validation rules', () => {
    it('should reject paths with .. segments', () => {
      expect(() => service.resolvePath('$./path/../file.meld'))
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
    });

    it.skip('should reject raw absolute paths', () => {
      expect(() => service.resolvePath('/absolute/path/file.meld'))
        .toThrow(new PathValidationError(
          'Raw absolute paths are not allowed - use $. for project-relative paths and $~ for home-relative paths',
          PathErrorCode.RAW_ABSOLUTE_PATH
        ));
    });

    it('should reject paths with slashes but no path variable', () => {
      expect(() => service.resolvePath('path/to/file.meld'))
        .toThrow(new PathValidationError(
          'Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
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

    it.skip('should provide helpful error messages for raw absolute paths', () => {
      try {
        service.resolvePath('/absolute/path.meld');
        fail('Should have thrown error');
      } catch (e) {
        const err = e as PathValidationError;
        expect(err.code).toBe(PathErrorCode.RAW_ABSOLUTE_PATH);
        expect(err.message).toContain('use $. for project-relative paths');
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