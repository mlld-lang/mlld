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
import * as pathTypes from '@core/types/paths.js';
import { MeldResolutionError, PathValidationError, VariableResolutionError } from '@core/errors/index.js';
import { createVariableReferenceNode } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { TestContextDI } from '@tests/utils/di/index.js';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

// Helper function to create mock PathVariable using unsafe creators
const createMockPathVariable = (name: string, rawPath: string, contentType: pathTypes.PathContentType = pathTypes.PathContentType.FILESYSTEM): PathVariable => {
  let validatedPath: pathTypes.ValidatedResourcePath;
  let isAbsolute = false;
  if (contentType === pathTypes.PathContentType.FILESYSTEM) {
    validatedPath = pathTypes.unsafeCreateValidatedResourcePath(rawPath);
    isAbsolute = rawPath.startsWith('/') || rawPath.startsWith('$HOMEPATH');
  } else { // Assuming URL (though not used in these tests)
    validatedPath = pathTypes.unsafeCreateValidatedResourcePath(rawPath); // Placeholder for URL
  }
  
  const value: pathTypes.MeldPath = {
    contentType: contentType,
    originalValue: rawPath,
    validatedPath,
    isAbsolute,
    isSecure: true // Assume secure for mock
  };
  
  return {
    name,
    valueType: VariableType.PATH,
    value,
    source: { type: 'definition', filePath: 'mock' }
  };
};

describe('PathResolver', () => {
  let contextDI: TestContextDI;
  let resolver: PathResolver;
  let stateService: DeepMockProxy<IStateService>;
  let pathService: DeepMockProxy<IPathService>;
  let context: ResolutionContext;

  beforeEach(async () => {
    contextDI = TestContextDI.createIsolated();

    stateService = mockDeep<IStateService>();
    pathService = mockDeep<IPathService>();

    contextDI.registerMock<IStateService>('IStateService', stateService);
    contextDI.registerMock<IPathService>('IPathService', pathService);

    pathService.resolvePath.mockImplementation(async (p, purpose, base) => { 
        const rawPathInput = typeof p === 'string' ? p : p.originalValue;
        let resolvedRawString = rawPathInput;
         if (rawPathInput === '$HOMEPATH') resolvedRawString = '/home/user';
         else if (rawPathInput === '$./docs' && base === 'test.meld') resolvedRawString = '/project/docs'; // Assume /project/ base
         else if (rawPathInput === 'relative/path' && base === 'test.meld') resolvedRawString = '/project/relative/path';
         else if (rawPathInput === '/other/root/file') resolvedRawString = '/other/root/file';
         // Add more cases as needed

         const isAbsolute = resolvedRawString.startsWith('/');
         const value: pathTypes.MeldPath = {
           contentType: pathTypes.PathContentType.FILESYSTEM,
           originalValue: rawPathInput,
           validatedPath: pathTypes.unsafeCreateValidatedResourcePath(resolvedRawString),
           isAbsolute,
           isSecure: true
         };
         return value;
    });
    pathService.normalizePath.mockImplementation((p: string | pathTypes.MeldPath): pathTypes.MeldPath => {
        if (typeof p === 'string') { 
           const isAbsolute = p.startsWith('/');
           const validatedPath = isAbsolute ? pathTypes.unsafeCreateAbsolutePath(p) : pathTypes.unsafeCreateValidatedResourcePath(p);
           return { 
             contentType: pathTypes.PathContentType.FILESYSTEM, 
             originalValue: p, 
             validatedPath: validatedPath, 
             isAbsolute: isAbsolute, 
             isSecure: true 
           };
         }
         return p;
    });
    pathService.getHomePath.mockReturnValue('/home/user');
    pathService.isAbsolute.mockImplementation(p => typeof p === 'string' && p.startsWith('/'));

    // Updated validatePath mock to handle different contexts
    pathService.validatePath.mockImplementation(async (pathToValidate, validationContext) => {
        console.log(`[Mock validatePath] Input: ${pathToValidate.originalValue}, Context Rules: ${JSON.stringify(validationContext?.rules)}, Context Roots: ${validationContext?.allowedRoots}`);
        const rules = validationContext?.rules;
        const originalPath = pathToValidate.originalValue;
        const isAbsolute = pathToValidate.isAbsolute; 

        if (rules) {
            console.log(`[Mock validatePath] Checking rules for: ${originalPath}`);
            if (rules.allowRelative === false && !isAbsolute) {
                console.error(`[Mock validatePath] THROWING: Path must be absolute for ${originalPath}`);
                throw new PathValidationError('Path must be absolute', originalPath);
            }
            if (rules.allowAbsolute === false && isAbsolute) {
                 console.error(`[Mock validatePath] THROWING: Path must not be absolute for ${originalPath}`);
                throw new PathValidationError('Path must not be absolute', originalPath);
            }
            const allowedRoots = validationContext?.allowedRoots;
            if (allowedRoots && allowedRoots.length > 0) {
                 console.log(`[Mock validatePath] Checking allowed roots: ${allowedRoots} for ${originalPath}`);
                 const isValidRoot = allowedRoots.some(root => {
                     const resolvedPathStr = pathToValidate.validatedPath as string;
                     // Simple prefix check for mock
                     return resolvedPathStr.startsWith(root as string) || resolvedPathStr === root;
                 });
                 if (!isValidRoot) {
                     console.error(`[Mock validatePath] THROWING: Path must start with allowed root for ${originalPath}`);
                     throw new PathValidationError('Path must start with allowed root', originalPath);
                 }
                 console.log(`[Mock validatePath] Root check passed for ${originalPath}`);
            }
            // Add more rule checks here if needed for tests
        }
        
        console.log(`[Mock validatePath] Validation PASSED for: ${originalPath}, returning object.`);
        // If no error thrown, return the path object (simulating successful validation)
        return pathToValidate;
    });

    stateService.getPathVar.mockImplementation((name: string): PathVariable | undefined => {
        if (name === 'HOMEPATH') return createMockPathVariable(name, '$HOMEPATH');
        if (name === 'PROJECTPATH') return createMockPathVariable(name, '/project'); // Assume project root
        if (name === 'docs') return createMockPathVariable(name, '$./docs');
        if (name === 'relativePath') return createMockPathVariable(name, 'relative/path');
        if (name === 'otherPath') return createMockPathVariable(name, '/other/root/file');
        return undefined;
      });

    resolver = await contextDI.resolve(PathResolver);

    // Simplify context creation - rely on factory defaults (should include READ purpose)
    context = ResolutionContextFactory.create(stateService, '/project/test.meld') // Provide base path
      .withAllowedTypes([VariableType.PATH]);
  });
  
  afterEach(async () => {
    await contextDI?.cleanup();
  });

  describe('resolve', () => {
    it('should resolve system path variable ($HOMEPATH)', async () => {
      const node = createVariableReferenceNode('HOMEPATH', VariableType.PATH);
      
      // Expect pathService.resolvePath to be called implicitly by stateService.getPathVar mock now
      // Or directly if the resolver calls it.
      // Let's assume the stateService returns the pre-resolved MeldPath object.
      const expectedMeldPath = stateService.getPathVar('HOMEPATH')?.value;
      expect(expectedMeldPath).toBeDefined();
      // Path validation happens AFTER getting the variable
      // pathService.validatePath.calledWith(expectedMeldPath, context.pathContext).mockResolvedValue(undefined); // Remove specific mock

      const result = await resolver.resolve(node, context);
      
      // Expect a string result (the validated path)
      expect(result).toBe('/home/user'); 
      // pathService.validatePath.calledWith(expectedMeldPath, context.pathContext).mockResolvedValue(undefined); // Remove specific mock
    });

    it('should resolve user-defined path variable ($docs)', async () => {
      const node = createVariableReferenceNode('docs', VariableType.PATH);
      const expectedMeldPath = stateService.getPathVar('docs')?.value;
      expect(expectedMeldPath).toBeDefined();
      
      // Mock the specific resolvePath call if PathResolver calls it directly AFTER getting the var
      // Assuming PathResolver relies on the PathVariable's pre-resolved value for now
      const fullyResolvedPath = await pathService.resolvePath(expectedMeldPath!, pathTypes.PathPurpose.READ, '/project/test.meld');
      // pathService.validatePath.calledWith(fullyResolvedPath, context.pathContext).mockResolvedValue(undefined); // Remove specific mock

      const result = await resolver.resolve(node, context);
      
      // Expect a string result
      expect(result).toBe('/project/docs'); 
      expect(stateService.getPathVar).toHaveBeenCalledWith('docs');
      // pathService.validatePath.calledWith(fullyResolvedPath, context.pathContext).mockResolvedValue(undefined); // Remove specific mock
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

    it('should throw PathValidationError when path validation fails (e.g., requires absolute)', async () => {
      const node = createVariableReferenceNode('relativePath', VariableType.PATH);
      const modifiedContext = context.withPathContext({ 
        purpose: pathTypes.PathPurpose.READ,
        validation: { required: true, allowAbsolute: true, allowRelative: false }
      });
      
      const validationError = new PathValidationError('Path must be absolute', 'relative/path');
      // Get the variable first
      const pathVar = stateService.getPathVar('relativePath');
      const initialMeldPath = pathVar?.value;
      expect(initialMeldPath).toBeDefined();
      // Assume resolver gets the path, then validates it
      const resolvedMeldPath = await pathService.resolvePath(initialMeldPath!, modifiedContext.pathContext.purpose, modifiedContext.currentFilePath);
      // pathService.validatePath.calledWith(resolvedMeldPath, modifiedContext.pathContext).mockRejectedValue(validationError); // Remove specific mock

      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow(PathValidationError);
      // pathService.validatePath.calledWith(resolvedMeldPath, modifiedContext.pathContext).mockRejectedValue(validationError); // Remove specific mock
      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow('Path must be absolute');
    });
    
    it('should throw PathValidationError when path validation fails (e.g., allowed roots)', async () => {
      const node = createVariableReferenceNode('otherPath', VariableType.PATH);
      const modifiedContext = context.withPathContext({ 
        purpose: pathTypes.PathPurpose.READ,
         validation: { required: true, allowAbsolute: true, allowedRoots: ['/project'] }
      });
      
      const validationError = new PathValidationError('Path must start with allowed root', '/other/root/file');
      const pathVar = stateService.getPathVar('otherPath');
      const initialMeldPath = pathVar?.value;
      expect(initialMeldPath).toBeDefined();
      const resolvedMeldPath = await pathService.resolvePath(initialMeldPath!, modifiedContext.pathContext.purpose, modifiedContext.currentFilePath);
      // pathService.validatePath.calledWith(resolvedMeldPath, modifiedContext.pathContext).mockRejectedValue(validationError); // Remove specific mock
      
      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow(PathValidationError);
      // pathService.validatePath.calledWith(resolvedMeldPath, modifiedContext.pathContext).mockRejectedValue(validationError); // Remove specific mock
       await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow('Path must start with allowed root');
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
      expect(refs).toContain('complexPath');
    });
  });
}); 