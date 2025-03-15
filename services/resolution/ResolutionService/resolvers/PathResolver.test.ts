import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathResolver } from '@services/resolution/ResolutionService/resolvers/PathResolver.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode, StructuredPath } from '@core/syntax/types.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';

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

    it('should handle structured path objects', async () => {
      const structuredPath: StructuredPath = {
        raw: '$HOMEPATH/path/to/file.md',
        normalized: '/home/user/path/to/file.md',
        structured: {
          base: 'HOMEPATH',
          segments: ['path', 'to', 'file.md'],
          variables: {
            text: [],
            special: ['HOMEPATH'],
            path: []
          },
          cwd: false
        }
      };

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'testPath'
        }
      };

      vi.mocked(stateService.getPathVar).mockImplementation((name) => {
        if (name === 'HOMEPATH') return '/home/user';
        if (name === 'PROJECTPATH') return '/project';
        if (name === 'testPath') return structuredPath;
        return undefined;
      });
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user/path/to/file.md');
    });

    it('should handle structured path objects with variables', async () => {
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

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'complexPath'
        }
      };

      vi.mocked(stateService.getPathVar).mockImplementation((name) => {
        if (name === 'HOMEPATH') return '/home/user';
        if (name === 'PROJECTPATH') return '/project';
        if (name === 'complexPath') return structuredPath;
        return undefined;
      });
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('/home/user/path/to/example.md');
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
      await expect(resolver.resolve(node, context)).rejects.toThrow(MeldResolutionError);
    });

    it('should handle undefined path variables appropriately', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'undefinedPath'
        }
      };
      
      vi.mocked(stateService.getPathVar).mockReturnValue(undefined);
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Undefined path variable: undefinedPath');
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

    it('should throw when structured path is not absolute but required', async () => {
      const structuredPath: StructuredPath = {
        raw: 'relative/path',
        normalized: './relative/path',
        structured: {
          base: '.',
          segments: ['relative', 'path'],
          variables: {
            text: [],
            special: [],
            path: []
          },
          cwd: true
        }
      };

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'relativePath'
        }
      };

      vi.mocked(stateService.getPathVar).mockReturnValue(structuredPath);
      
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

    it('should throw when structured path does not start with allowed root', async () => {
      const structuredPath: StructuredPath = {
        raw: '/other/path',
        normalized: '/other/path',
        structured: {
          base: '/',
          segments: ['other', 'path'],
          variables: {
            text: [],
            special: [],
            path: []
          },
          cwd: false
        }
      };

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'otherPath'
        }
      };

      vi.mocked(stateService.getPathVar)
        .mockImplementation((name) => {
          if (name === 'HOMEPATH') return '/home/user';
          if (name === 'PROJECTPATH') return '/project';
          if (name === 'otherPath') return structuredPath;
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