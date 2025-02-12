import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathService, PathServiceDependencies } from '../path-service';
import * as pathModule from 'path';

describe('PathService', () => {
  let pathService: PathService;
  let deps: PathServiceDependencies;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up mocked dependencies
    deps = {
      homedir: vi.fn(() => '/home/user'),
      pathModule: {
        ...pathModule,
        normalize: vi.fn((p: string) => p),
        join: vi.fn((...paths: string[]) => paths.join('/')),
        dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
        isAbsolute: vi.fn((p: string) => p.startsWith('/')),
        sep: '/',
        relative: vi.fn((from: string, to: string) => {
          // Simple implementation for test purposes
          if (to.startsWith(from)) {
            return to.slice(from.length + 1);
          }
          return to;
        })
      }
    };
    
    // Create a new instance with mocked dependencies
    pathService = new PathService(deps);
    
    // Set default project path
    pathService.setDefaultProjectPath('/project/root');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('path resolution', () => {
    it('resolves $HOMEPATH paths', async () => {
      const resolved = await pathService.resolvePath('$HOMEPATH/test/file.txt');
      expect(resolved).toBe('/home/user/test/file.txt');
    });

    it('resolves $~ paths', async () => {
      const resolved = await pathService.resolvePath('$~/test/file.txt');
      expect(resolved).toBe('/home/user/test/file.txt');
    });

    it('resolves $PROJECTPATH paths', async () => {
      const resolved = await pathService.resolvePath('$PROJECTPATH/test/file.txt');
      expect(resolved).toBe('/project/root/test/file.txt');
    });

    it('resolves $. paths', async () => {
      const resolved = await pathService.resolvePath('$./test/file.txt');
      expect(resolved).toBe('/project/root/test/file.txt');
    });

    it('rejects paths without special variables', async () => {
      await expect(pathService.resolvePath('/absolute/path'))
        .rejects.toThrow('Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.');
    });

    it('rejects paths with relative navigation', async () => {
      await expect(pathService.resolvePath('$HOMEPATH/../test/file.txt'))
        .rejects.toThrow('Relative navigation (..) is not allowed in paths');
    });
  });

  describe('test mode', () => {
    it('allows overriding home path in test mode', async () => {
      pathService.enableTestMode('/test/home', '/test/project');
      const resolved = await pathService.resolvePath('$HOMEPATH/test/file.txt');
      expect(resolved).toBe('/test/home/test/file.txt');
    });

    it('allows overriding project path in test mode', async () => {
      pathService.enableTestMode('/test/home', '/test/project');
      const resolved = await pathService.resolvePath('$PROJECTPATH/test/file.txt');
      expect(resolved).toBe('/test/project/test/file.txt');
    });

    it('restores real paths when test mode is disabled', async () => {
      pathService.enableTestMode('/test/home', '/test/project');
      pathService.disableTestMode();

      const homeResolved = await pathService.resolvePath('$HOMEPATH/test/file.txt');
      expect(homeResolved).toBe('/home/user/test/file.txt');

      const projectResolved = await pathService.resolvePath('$PROJECTPATH/test/file.txt');
      expect(projectResolved).toBe('/project/root/test/file.txt');
    });
  });

  describe('path getters', () => {
    it('returns real home path by default', () => {
      expect(pathService.getHomePath()).toBe('/home/user');
    });

    it('returns real project path by default', () => {
      expect(pathService.getProjectPath()).toBe('/project/root');
    });

    it('returns test paths when in test mode', () => {
      pathService.enableTestMode('/test/home', '/test/project');
      expect(pathService.getHomePath()).toBe('/test/home');
      expect(pathService.getProjectPath()).toBe('/test/project');
    });

    it('returns real paths for undefined test paths', () => {
      pathService.enableTestMode(undefined, undefined);
      expect(pathService.getHomePath()).toBe('/home/user');
      expect(pathService.getProjectPath()).toBe('/project/root');
    });
  });
}); 