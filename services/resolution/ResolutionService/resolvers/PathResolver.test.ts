import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PathResolver } from '@services/resolution/ResolutionService/resolvers/PathResolver.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { 
  ResolutionContext, 
  VariableType, 
  PathVariable, 
  PathResolutionContext,
  PathPurpose 
} from '@core/types';
import type { VariableReferenceNode } from '@core/types/ast-types';
import { MeldPath, createMeldPath } from '@core/types/path-types';
import { MeldResolutionError, PathValidationError } from '@core/types/errors';
import { createMockStateService, createVariableReferenceNode } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';

describe('PathResolver', () => {
  let resolver: PathResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let pathService: IPathService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();
    
    pathService = {
      resolvePath: vi.fn().mockImplementation(async (p, purpose, base) => createMeldPath(typeof p === 'string' ? p : p.raw, base)),
      normalizePath: vi.fn().mockImplementation(p => typeof p === 'string' ? createMeldPath(p) : p),
      validatePath: vi.fn().mockResolvedValue(undefined),
      getHomePath: vi.fn().mockReturnValue('/home/user'),
      isAbsolute: vi.fn().mockImplementation(p => p.startsWith('/')),
    } as unknown as IPathService;

    vi.mocked(stateService.getPathVar).mockImplementation((name: string): PathVariable | undefined => {
        if (name === 'HOMEPATH') return { name, valueType: 'path', value: createMeldPath('/home/user'), source: { type: 'system' } };
        if (name === 'PROJECTPATH') return { name, valueType: 'path', value: createMeldPath('/project'), source: { type: 'system' } };
        if (name === 'docs') return { name, valueType: 'path', value: createMeldPath('$./docs'), source: { type: 'definition', filePath: 'mock' } };
        if (name === 'relativePath') return { name, valueType: 'path', value: createMeldPath('relative/path'), source: { type: 'definition', filePath: 'mock' } };
        if (name === 'otherPath') return { name, valueType: 'path', value: createMeldPath('/other/root/file'), source: { type: 'definition', filePath: 'mock' } };
        return undefined;
      });

    resolver = new PathResolver(stateService, pathService); 

    context = ResolutionContextFactory.create(stateService, 'test.meld')
      .withAllowedTypes([VariableType.PATH])
      .withPathContext({ purpose: PathPurpose.READ });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolve', () => {
    it('should resolve system path variable ($HOMEPATH)', async () => {
      const node = createVariableReferenceNode('HOMEPATH', VariableType.PATH);
      const result = await resolver.resolve(node, context);
      
      expect(result).toBeInstanceOf(MeldPath);
      expect(result.normalized).toBe('/home/user');
      expect(pathService.validatePath).toHaveBeenCalledWith(expect.any(MeldPath), context.pathContext);
    });

    it('should resolve user-defined path variable ($docs)', async () => {
      const node = createVariableReferenceNode('docs', VariableType.PATH);
      vi.mocked(pathService.resolvePath).mockResolvedValueOnce(createMeldPath('/project/docs'));

      const result = await resolver.resolve(node, context);
      
      expect(result).toBeInstanceOf(MeldPath);
      expect(result.normalized).toBe('/project/docs');
      expect(stateService.getPathVar).toHaveBeenCalledWith('docs');
      expect(pathService.resolvePath).toHaveBeenCalledWith(expect.objectContaining({ raw: '$./docs' }), context.pathContext.purpose, context.currentFilePath);
      expect(pathService.validatePath).toHaveBeenCalledWith(expect.any(MeldPath), context.pathContext);
    });

    it('should throw MeldResolutionError for undefined path variables in strict mode', async () => {
      const node = createVariableReferenceNode('undefinedPath', VariableType.PATH);
      context = context.withFlags({ ...context.flags, strict: true });
      vi.mocked(stateService.getPathVar).mockReturnValue(undefined);

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
      vi.mocked(stateService.getPathVar).mockReturnValue(undefined);

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
        ...context.pathContext, 
        validation: { required: true, allowAbsolute: true, allowRelative: false }
      });
      
      const validationError = new PathValidationError('Path must be absolute', 'relative/path');
      vi.mocked(pathService.validatePath).mockRejectedValue(validationError);

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
        ...context.pathContext, 
         validation: { required: true, allowAbsolute: true, allowedRoots: ['/project'] }
      });
      
      const validationError = new PathValidationError('Path must start with allowed root', '/other/root/file');
      vi.mocked(pathService.validatePath).mockRejectedValue(validationError);
      
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