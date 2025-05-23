import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathDirectiveHandler } from './PathDirectiveHandler.minimal';
import { StateService } from '@services/state/StateService/StateService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.new';
import type { DirectiveNode } from '@core/ast/types';
import { createTextVariable } from '@core/types';

describe('PathDirectiveHandler (Minimal)', () => {
  let handler: PathDirectiveHandler;
  let state: StateService;
  let resolver: ResolutionService;

  beforeEach(() => {
    state = new StateService();
    resolver = new ResolutionService();
    
    // Initialize resolver with mock dependencies
    resolver.initialize({
      fileSystem: {
        executeCommand: vi.fn(),
        getCwd: () => '/project'
      },
      pathService: {
        resolve: (path: string, base: string) => {
          if (path.startsWith('/')) return path;
          // Remove ./ from the beginning of path
          const cleanPath = path.replace(/^\.\//, '');
          return `${base}/${cleanPath}`;
        },
        normalize: (path: string) => {
          // Normalize multiple slashes and remove ./ in the middle
          return path.replace(/\/+/g, '/').replace(/\/\.\//g, '/');
        }
      }
    });
    
    handler = new PathDirectiveHandler(resolver);
  });

  it('should handle simple relative path', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'path',
      raw: {
        identifier: 'configPath'
      },
      values: {
        path: 'config/app.json'
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/src/index.ts'
    });

    expect(result.stateChanges?.variables?.configPath).toMatchObject({
      name: 'configPath',
      value: '/project/src/config/app.json',
      type: 'path'
    });
  });

  it('should handle absolute path', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'path',
      raw: {
        identifier: 'rootPath'
      },
      values: {
        path: '/etc/hosts'
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(result.stateChanges?.variables?.rootPath?.value).toBe('/etc/hosts');
  });

  it('should handle $HOMEPATH', async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = '/home/user';
    
    try {
      const directive: DirectiveNode = {
        type: 'directive',
        kind: 'path',
        raw: {
          identifier: 'homePath'
        },
        values: {
          path: '$HOMEPATH/documents'
        }
      } as any;

      const result = await handler.handle(directive, state, {
        strict: false
      });

      expect(result.stateChanges?.variables?.homePath?.value).toBe('/home/user/documents');
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it('should handle $PROJECTPATH', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'path',
      raw: {
        identifier: 'projectPath'
      },
      values: {
        path: '$PROJECTPATH/src'
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(result.stateChanges?.variables?.projectPath?.value).toBe('/project/src');
  });

  it('should handle path with variable interpolation', async () => {
    state.setVariable(createTextVariable('folder', 'data'));
    
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'path',
      raw: {
        identifier: 'dataPath'
      },
      values: {
        path: [
          { type: 'text', value: './' },
          { type: 'variable', node: { name: 'folder' } },
          { type: 'text', value: '/file.json' }
        ]
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false,
      filePath: '/project/app/main.ts'
    });

    expect(result.stateChanges?.variables?.dataPath?.value).toBe('/project/app/data/file.json');
  });

  it('should throw error for missing identifier', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'path',
      raw: {},
      values: {
        path: '/some/path'
      }
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Path directive missing identifier');
  });

  it('should throw error for missing path', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'path',
      raw: {
        identifier: 'test'
      },
      values: {}
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Path directive missing path');
  });
});