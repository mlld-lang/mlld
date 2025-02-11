import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pathService } from '../path-service';
import { homedir } from 'os';
import { normalize } from 'path';

// Mock os.homedir
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user')
}));

// Mock process.cwd
const mockCwd = vi.spyOn(process, 'cwd');
mockCwd.mockReturnValue('/project/root');

describe('PathService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathService.disableTestMode();
  });

  describe('path resolution', () => {
    it('resolves $HOMEPATH paths', () => {
      const resolved = pathService.resolvePath('$HOMEPATH/test/file.txt');
      expect(resolved).toBe(normalize('/home/user/test/file.txt'));
    });

    it('resolves $~ paths', () => {
      const resolved = pathService.resolvePath('$~/test/file.txt');
      expect(resolved).toBe(normalize('/home/user/test/file.txt'));
    });

    it('resolves $PROJECTPATH paths', () => {
      const resolved = pathService.resolvePath('$PROJECTPATH/test/file.txt');
      expect(resolved).toBe(normalize('/project/root/test/file.txt'));
    });

    it('resolves $. paths', () => {
      const resolved = pathService.resolvePath('$./test/file.txt');
      expect(resolved).toBe(normalize('/project/root/test/file.txt'));
    });

    it('rejects paths without special variables', () => {
      expect(() => pathService.resolvePath('/absolute/path'))
        .toThrow('Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.');
    });

    it('rejects paths with relative navigation', () => {
      expect(() => pathService.resolvePath('$HOMEPATH/../test/file.txt'))
        .toThrow('Path must not contain relative navigation (..)');
    });
  });

  describe('test mode', () => {
    it('allows overriding home path in test mode', () => {
      pathService.enableTestMode('/test/home');
      const resolved = pathService.resolvePath('$HOMEPATH/test/file.txt');
      expect(resolved).toBe(normalize('/test/home/test/file.txt'));
    });

    it('allows overriding project path in test mode', () => {
      pathService.enableTestMode(undefined, '/test/project');
      const resolved = pathService.resolvePath('$PROJECTPATH/test/file.txt');
      expect(resolved).toBe(normalize('/test/project/test/file.txt'));
    });

    it('restores real paths when test mode is disabled', () => {
      pathService.enableTestMode('/test/home', '/test/project');
      pathService.disableTestMode();

      const homeResolved = pathService.resolvePath('$HOMEPATH/test/file.txt');
      expect(homeResolved).toBe(normalize('/home/user/test/file.txt'));

      const projectResolved = pathService.resolvePath('$PROJECTPATH/test/file.txt');
      expect(projectResolved).toBe(normalize('/project/root/test/file.txt'));
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
      pathService.enableTestMode();
      expect(pathService.getHomePath()).toBe('/home/user');
      expect(pathService.getProjectPath()).toBe('/project/root');
    });
  });
}); 