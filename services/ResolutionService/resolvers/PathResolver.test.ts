import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathResolver } from './PathResolver';
import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

describe('PathResolver', () => {
  let resolver: PathResolver;
  let stateService: IStateService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getPathVar: vi.fn(),
      setPathVar: vi.fn(),
    } as unknown as IStateService;

    resolver = new PathResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: false,
        data: false,
        path: true,
        command: false
      },
      pathValidation: {
        requireAbsolute: true,
        allowedRoots: ['HOMEPATH', 'PROJECTPATH']
      }
    };

    // Mock root paths
    vi.mocked(stateService.getPathVar)
      .mockImplementation((name) => {
        if (name === 'HOMEPATH') return '/home/user';
        if (name === 'PROJECTPATH') return '/project';
        return undefined;
      });
  });

  describe('resolve', () => {
    it('should return content of text node unchanged', async () => {
      const node: TextNode = {
        type: 'Text',
        content: '/home/user/file'
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user/file');
    });

    it('should resolve path directive node', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'HOMEPATH'
        }
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user');
      expect(stateService.getPathVar).toHaveBeenCalledWith('HOMEPATH');
    });

    it('should handle $~ alias for HOMEPATH', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: '~'
        }
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user');
      expect(stateService.getPathVar).toHaveBeenCalledWith('HOMEPATH');
    });

    it('should handle $. alias for PROJECTPATH', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: '.'
        }
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/project');
      expect(stateService.getPathVar).toHaveBeenCalledWith('PROJECTPATH');
    });
  });

  describe('error handling', () => {
    it('should throw when path variables are not allowed', async () => {
      context.allowedVariableTypes.path = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'test'
        }
      };
      await expect(resolver.resolve(node, context)).rejects.toThrow(ResolutionError);
    });

    it('should throw on undefined path variable', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'missing',
          value: ''
        }
      };
      vi.mocked(stateService.getPathVar).mockReturnValue(undefined);
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Undefined path variable: missing');
    });

    it('should throw when path is not absolute but required', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'path'
        }
      };
      vi.mocked(stateService.getPathVar).mockReturnValue('relative/path');
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Path must be absolute');
    });

    it('should throw when path does not start with allowed root', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'path'
        }
      };
      vi.mocked(stateService.getPathVar)
        .mockImplementation((name) => {
          if (name === 'HOMEPATH') return '/home/user';
          if (name === 'PROJECTPATH') return '/project';
          if (name === 'path') return '/other/path';
          return undefined;
        });

      context.pathValidation = {
        requireAbsolute: true,
        allowedRoots: ['HOMEPATH', 'PROJECTPATH']
      };
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Path must start with one of: HOMEPATH, PROJECTPATH');
    });

    it('should throw on invalid node type', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid node type for path resolution');
    });

    it('should throw on missing variable identifier', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          value: ''
        }
      };
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Path variable identifier is required');
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
  });
}); 