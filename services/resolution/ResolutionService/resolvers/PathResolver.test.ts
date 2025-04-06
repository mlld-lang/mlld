// process.stdout.write('--- TOP LEVEL TEST LOG VISIBLE (stdout.write)? ---\n'); // Removed DEBUG log

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PathResolver } from '@services/resolution/ResolutionService/resolvers/PathResolver.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { 
  ResolutionContext, 
  VariableType, 
  PathVariable 
} from '@core/types';
import type { VariableReferenceNode, MeldNode, StructuredPath } from '@core/syntax/types.js';
import { 
  PathPurpose, 
  PathValidationError as CorePathValidationError,
  unsafeCreateValidatedResourcePath,
  unsafeCreateAbsolutePath,
  PathContentType,
  type MeldPath,
  type ValidatedResourcePath,
  type PathValidationContext
} from '@core/types/paths.js';
import { MeldResolutionError, VariableResolutionError, PathValidationError } from '@core/errors/index.js';
import { createVariableReferenceNode } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { TestContextDI } from '@tests/utils/di/index.js';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { expectToThrowWithConfig } from '@tests/utils/errorTestUtils.js';

// Helper function to create mock PathVariable using unsafe creators
const createMockPathVariable = (name: string, rawPath: string, contentType: PathContentType = PathContentType.FILESYSTEM): PathVariable => {
  // Let validatedPath be determined by resolvePath mock, don't pre-populate it here.
  // let validatedPath: ValidatedResourcePath;
  let isAbsolute = false;
  if (contentType === PathContentType.FILESYSTEM) {
    // validatedPath = unsafeCreateValidatedResourcePath(rawPath); // REMOVED
    isAbsolute = rawPath.startsWith('/') || rawPath.startsWith('$HOMEPATH') || rawPath.startsWith('$.'); // Added check for $.
  } else { // Assuming URL (though not used in these tests)
    // validatedPath = unsafeCreateValidatedResourcePath(rawPath); // REMOVED
  }
  
  // Simplified: Return a structure that primarily holds the original value and basic flags.
  // The resolver relies on pathService.resolvePath and pathService.validatePath mocks.
  const value: Partial<MeldPath> & { contentType: PathContentType; originalValue: string; isAbsolute: boolean } = {
    contentType: contentType,
    originalValue: rawPath,
    isAbsolute: isAbsolute,
    isSecure: true, // Assume secure for mock
    // validatedPath and other fields are not strictly needed here if mocks are correct.
  };
  
  return {
    name,
    valueType: VariableType.PATH,
    value: value as MeldPath, // Cast back, acknowledging it's partial
    source: { type: 'definition', filePath: 'mock' }
  };
};

describe('PathResolver', () => {
  let contextDI: TestContextDI;
  let resolver: PathResolver;
  let stateService: DeepMockProxy<IStateService>;
  let pathService: Partial<IPathService>;
  let validatePathMock: ReturnType<typeof vi.fn>;
  let resolvePathMock: ReturnType<typeof vi.fn>;
  let dirnameMock: ReturnType<typeof vi.fn>;
  let context: ResolutionContext;

  beforeEach(async () => {
    contextDI = TestContextDI.createIsolated();

    stateService = mockDeep<IStateService>();
    
    // --- Manual Mock for IPathService ---
    validatePathMock = vi.fn();
    resolvePathMock = vi.fn();
    dirnameMock = vi.fn();

    pathService = {
      validatePath: validatePathMock,
      resolvePath: resolvePathMock,
      dirname: dirnameMock,
      // Add other methods if needed by the resolver, can be simple vi.fn()
      normalizePath: vi.fn((p: string | MeldPath) => Promise.resolve(typeof p === 'string' ? createMeldPath(p, unsafeCreateValidatedResourcePath(p), p.startsWith('/')) : p)),
      getHomePath: vi.fn(() => '/home/user'),
      isAbsolutePath: vi.fn((p: any) => typeof p === 'string' && p.startsWith('/'))
    };
    // --- End Manual Mock ---

    contextDI.registerMock<IStateService>('IStateService', stateService);
    // Register the manual mock object
    contextDI.registerMock<IPathService>('IPathService', pathService as IPathService);

    // Configure resolvePath mock (similar to before, but using mockResolvedValue)
    resolvePathMock.mockImplementation(async (p, purpose, base) => { 
        const rawPathInput = typeof p === 'string' ? p : p.originalValue;
        let resolvedRawString = rawPathInput;
        if (rawPathInput === '$HOMEPATH') resolvedRawString = '/home/user';
        else if (rawPathInput === '$./docs' && base?.endsWith('test.meld')) resolvedRawString = '/project/docs';
        else if (rawPathInput === 'relative/path' && base?.endsWith('test.meld')) resolvedRawString = '/project/relative/path';
        else if (rawPathInput === '/other/root/file') resolvedRawString = '/other/root/file';
        else if (rawPathInput.startsWith('$./') && base) { // Generic relative path handling
            // Basic join simulation - replace with actual pathService.dirname if needed
            const baseDir = base.substring(0, base.lastIndexOf('/'));
            resolvedRawString = `${baseDir}/${rawPathInput.substring(3)}`; // Remove '$./'
        } else if (!rawPathInput.startsWith('/') && !rawPathInput.startsWith('$') && base) { // Other relative paths
            const baseDir = base.substring(0, base.lastIndexOf('/'));
            resolvedRawString = `${baseDir}/${rawPathInput}`;
        }

        const isAbsolute = resolvedRawString.startsWith('/');
        const value: MeldPath = {
          contentType: PathContentType.FILESYSTEM,
          originalValue: rawPathInput,
          validatedPath: unsafeCreateValidatedResourcePath(resolvedRawString),
          isAbsolute,
          isSecure: true
        };
        console.log(`[Manual Mock resolvePath] Input: ${rawPathInput}, Base: ${base}, Output:`, value);
        return Promise.resolve(value); // Use mockResolvedValue implicitly via async
    });
    
    // Configure dirname mock
    dirnameMock.mockImplementation((p) => {
        if (typeof p !== 'string') return '.';
        const lastSlash = p.lastIndexOf('/');
        if (lastSlash === -1) return '.';
        if (lastSlash === 0) return '/';
        return p.substring(0, lastSlash);
    });

    // Configure validatePath mock - Default behavior: resolve successfully
    validatePathMock.mockImplementation(async (pathToValidate: MeldPath, validationContext?: PathValidationContext) => {
        process.stdout.write(`[validatePathMock ENTRY] Validating: ${pathToValidate?.validatedPath}\n`); // DEBUG
        // This default implementation should always resolve, 
        // the spyOn().mockRejectedValueOnce() in tests handles rejection.
        return Promise.resolve(pathToValidate); 
    });

    // Configure stateService mock (remains the same)
    stateService.getPathVar.mockImplementation((name: string): PathVariable | undefined => {
        if (name === 'HOMEPATH') return createMockPathVariable(name, '$HOMEPATH');
        if (name === 'PROJECTPATH') return createMockPathVariable(name, '/project');
        if (name === 'docs') return createMockPathVariable(name, '$./docs');
        if (name === 'relativePath') return createMockPathVariable(name, 'relative/path');
        if (name === 'otherPath') return createMockPathVariable(name, '/other/root/file');
        return undefined;
    });

    resolver = await contextDI.resolve(PathResolver);

    context = ResolutionContextFactory.create(stateService, '/project/test.meld')
      .withAllowedTypes([VariableType.PATH]);
  });
  
  afterEach(async () => {
    await contextDI?.cleanup();
  });

  describe('resolve', () => {
    it('should resolve system path variable ($HOMEPATH)', async () => {
      const node = createVariableReferenceNode('HOMEPATH', VariableType.PATH);
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user'); 
      expect(resolvePathMock).toHaveBeenCalled();
      expect(validatePathMock).toHaveBeenCalled();
    });

    it('should resolve user-defined path variable ($docs)', async () => {
      const node = createVariableReferenceNode('docs', VariableType.PATH);
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/project/docs'); 
      expect(stateService.getPathVar).toHaveBeenCalledWith('docs');
      expect(resolvePathMock).toHaveBeenCalled();
      expect(validatePathMock).toHaveBeenCalled();
    });

    it('should throw MeldResolutionError for undefined path variables in strict mode', async () => {
      const node = createVariableReferenceNode('undefinedPath', VariableType.PATH);
      context = context.withFlags({ ...context.flags, strict: true });
      stateService.getPathVar.calledWith('undefinedPath').mockReturnValue(undefined);

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(VariableResolutionError);
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Path variable 'undefinedPath' not found");
    });

    it('should return default/empty MeldPath for undefined variables in non-strict mode', async () => {
      const node = createVariableReferenceNode('undefinedPath', VariableType.PATH);
      context = context.withFlags({ ...context.flags, strict: false });
      stateService.getPathVar.calledWith('undefinedPath').mockReturnValue(undefined);

      const result = await resolver.resolve(node, context);
      expect(result).toBe(''); 
    });

    it('should throw MeldResolutionError when path variables are not allowed', async () => {
      const node = createVariableReferenceNode('docs', VariableType.PATH);
      const modifiedContext = context.withAllowedTypes([VariableType.TEXT]);

      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow(MeldResolutionError);
       await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow('Path variables are not allowed');
    });

    // Test #1: Requires absolute
    it('should throw PathValidationError when path validation fails (e.g., requires absolute)', async () => {
      const node = createVariableReferenceNode('relativePath', VariableType.PATH);
      const modifiedContext = context.withPathContext({ 
        purpose: PathPurpose.READ,
        validation: { required: true, allowAbsolute: true, allowRelative: false }
      });
      
      const expectedResolvedPath = '/project/relative/path';
      const expectedError = new PathValidationError('Path must be absolute', expectedResolvedPath);
      const spy = vi.spyOn(pathService, 'validatePath').mockRejectedValueOnce(expectedError);

      // process.stdout.write(`[TEST requires absolute] About to call resolver.resolve()\n`); // Removed DEBUG log

      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(
        async () => await resolver.resolve(node, modifiedContext),
        {
          errorType: PathValidationError,
          // code: 'E_PATH_MUST_BE_ABSOLUTE', // Assuming PathValidationError might not have codes directly
          message: 'Path must be absolute',
          // Optionally check details if the error object includes them
          details: { pathString: expectedResolvedPath } 
        }
      );
        
      spy.mockRestore(); 
    });
    
    // Test #2: Allowed roots
    it('should throw PathValidationError when path validation fails (e.g., allowed roots)', async () => {
      const node = createVariableReferenceNode('otherPath', VariableType.PATH);
      const modifiedContext = context.withPathContext({ 
        purpose: PathPurpose.READ,
         validation: { required: true, allowAbsolute: true, allowedRoots: ['/project'] }
      });
      
      const expectedResolvedPath = '/other/root/file'; 
      const expectedError = new PathValidationError('Path must start with allowed root', expectedResolvedPath);
      const spy = vi.spyOn(pathService, 'validatePath').mockRejectedValueOnce(expectedError);

      // process.stdout.write(`[TEST allowed roots] About to call resolver.resolve()\n`); // Removed DEBUG log

      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(
        async () => await resolver.resolve(node, modifiedContext),
        {
          errorType: PathValidationError,
          // code: 'E_PATH_INVALID_ROOT',
          message: 'Path must start with allowed root',
          details: { pathString: expectedResolvedPath }
        }
      );
        
      spy.mockRestore(); 
    });
  });

  describe('extractReferences', () => {
    it('should extract variable identifier from path directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should resolve ~ alias to HOMEPATH', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: '~',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['HOMEPATH']);
    });

    it('should resolve . alias to PROJECTPATH', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: '.',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['PROJECTPATH']);
    });

    it('should return empty array for non-path directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', async () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no references here'
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should extract references from structured path', async () => {
      const structuredPath: StructuredPath = {
        raw: '$HOMEPATH/path/to/{{file}}.md',
        normalized: '/home/user/path/to/example.md',
        structured: {
          base: 'HOMEPATH',
          segments: ['path', 'to', '{{file}}.md'],
          variables: {
            text: ['file'],
            special: ['HOMEPATH'],
            path: []
          },
          cwd: false
        }
      };

      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'complexPath',
          value: structuredPath
        }
      };

      const refs = resolver.extractReferences(node);
      // Corrected expectation: getReferencedVariables should handle this
      // expect(refs).toContain('complexPath'); // extractReferences might not do deep analysis
      // Test getReferencedVariables directly if needed. For extractReferences, simple identifier is expected.
      expect(refs).toEqual(['complexPath']);
    });
  });
}); 