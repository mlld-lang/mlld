import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PathResolver } from '@services/resolution/ResolutionService/resolvers/PathResolver.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { 
  ResolutionContext, 
  VariableType, 
  PathVariable, 
  PathPurpose 
} from '@core/types';
import type { VariableReferenceNode, MeldNode, StructuredPath } from '@core/syntax/types.js';
import { MeldPath, PathContentType } from '@core/types/paths.js';
import { MeldResolutionError, PathValidationError } from '@core/errors/index.js';
import { createVariableReferenceNode } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { TestContextDI } from '@tests/utils/di/index.js';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { createMeldPath } from '@core/types/paths.js';

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

    pathService.resolvePath.mockImplementation(async (p, purpose, base) => 
      createMeldPath(typeof p === 'string' ? p : p.raw, base)
    );
    pathService.normalizePath.mockImplementation(p => typeof p === 'string' ? createMeldPath(p) : p);
    pathService.validatePath.mockResolvedValue(undefined);
    pathService.getHomePath.mockReturnValue('/home/user');
    pathService.isAbsolute.mockImplementation(p => p.startsWith('/'));

    stateService.getPathVar.mockImplementation((name: string): PathVariable | undefined => {
        if (name === 'HOMEPATH') return { name, valueType: 'path', value: createMeldPath('/home/user'), source: { type: 'system' } };
        if (name === 'PROJECTPATH') return { name, valueType: 'path', value: createMeldPath('/project'), source: { type: 'system' } };
        if (name === 'docs') return { name, valueType: 'path', value: createMeldPath('$./docs'), source: { type: 'definition', filePath: 'mock' } };
        if (name === 'relativePath') return { name, valueType: 'path', value: createMeldPath('relative/path'), source: { type: 'definition', filePath: 'mock' } };
        if (name === 'otherPath') return { name, valueType: 'path', value: createMeldPath('/other/root/file'), source: { type: 'definition', filePath: 'mock' } };
        return undefined;
      });

    resolver = await contextDI.resolve(PathResolver);

    context = ResolutionContextFactory.create(stateService, 'test.meld')
      .withAllowedTypes([VariableType.PATH])
      .withPathContext({ purpose: PathPurpose.READ });
  });
  
  afterEach(async () => {
    await contextDI?.cleanup();
  });

  describe('resolve', () => {
    it('should resolve system path variable ($HOMEPATH)', async () => {
      const node = createVariableReferenceNode('HOMEPATH', VariableType.PATH);
      
      const expectedPath = createMeldPath('/home/user');
      pathService.resolvePath.calledWith(expect.objectContaining({ raw: '/home/user' })).mockResolvedValue(expectedPath);

      const result = await resolver.resolve(node, context);
      
      expect(result).toBeInstanceOf(MeldPath);
      expect(result.normalized).toBe('/home/user');
      expect(pathService.validatePath).toHaveBeenCalledWith(expectedPath, context.pathContext);
    });

    it('should resolve user-defined path variable ($docs)', async () => {
      const node = createVariableReferenceNode('docs', VariableType.PATH);
      const resolvedPath = createMeldPath('/project/docs');
      pathService.resolvePath.calledWith(expect.objectContaining({ raw: '$./docs' }), context.pathContext.purpose, context.currentFilePath).mockResolvedValue(resolvedPath);

      const result = await resolver.resolve(node, context);
      
      expect(result).toBeInstanceOf(MeldPath);
      expect(result.normalized).toBe('/project/docs');
      expect(stateService.getPathVar).toHaveBeenCalledWith('docs');
      expect(pathService.resolvePath).toHaveBeenCalledWith(expect.objectContaining({ raw: '$./docs' }), context.pathContext.purpose, context.currentFilePath);
      expect(pathService.validatePath).toHaveBeenCalledWith(resolvedPath, context.pathContext);
    });

    it('should throw MeldResolutionError for undefined path variables in strict mode', async () => {
      const node = createVariableReferenceNode('undefinedPath', VariableType.PATH);
      context = context.withFlags({ ...context.flags, strict: true });
      stateService.getPathVar.calledWith('undefinedPath').mockReturnValue(undefined);

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(MeldResolutionError);
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Path variable 'undefinedPath' not found");
    });

    it('should return default/empty MeldPath for undefined variables in non-strict mode', async () => {
      const node = createVariableReferenceNode('undefinedPath', VariableType.PATH);
      context = context.withFlags({ ...context.flags, strict: false });
      stateService.getPathVar.calledWith('undefinedPath').mockReturnValue(undefined);

      const result = await resolver.resolve(node, context);
      
      expect(result).toBeInstanceOf(MeldPath);
      expect(result.raw).toBe(''); 
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
        purpose: PathPurpose.READ,
        validation: { required: true, allowAbsolute: true, allowRelative: false }
      });
      
      const validationError = new PathValidationError('Path must be absolute', 'relative/path');
      const relativeMeldPath = createMeldPath('relative/path'); 
      pathService.resolvePath.calledWith(expect.objectContaining({ raw: 'relative/path' })).mockResolvedValue(relativeMeldPath);
      pathService.validatePath.calledWith(relativeMeldPath, modifiedContext.pathContext).mockRejectedValue(validationError);

      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow(PathValidationError);
      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow('Path must be absolute');
    });
    
    it('should throw PathValidationError when path validation fails (e.g., allowed roots)', async () => {
      const node = createVariableReferenceNode('otherPath', VariableType.PATH);
      const modifiedContext = context.withPathContext({ 
        purpose: PathPurpose.READ,
         validation: { required: true, allowAbsolute: true, allowedRoots: ['/project'] }
      });
      
      const validationError = new PathValidationError('Path must start with allowed root', '/other/root/file');
      const otherMeldPath = createMeldPath('/other/root/file');
      pathService.resolvePath.calledWith(expect.objectContaining({ raw: '/other/root/file' })).mockResolvedValue(otherMeldPath);
      pathService.validatePath.calledWith(otherMeldPath, modifiedContext.pathContext).mockRejectedValue(validationError);
      
      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow(PathValidationError);
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