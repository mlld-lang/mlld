import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathResolver } from './PathResolver';
import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';

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
    it('should return path without variables unchanged', async () => {
      const result = await resolver.resolve('/home/user/file', context);
      expect(result).toBe('/home/user/file');
    });

    it('should resolve simple path variable', async () => {
      const result = await resolver.resolve('$HOMEPATH', context);
      expect(result).toBe('/home/user');
      expect(stateService.getPathVar).toHaveBeenCalledWith('HOMEPATH');
    });

    it('should resolve multiple path variables', async () => {
      vi.mocked(stateService.getPathVar)
        .mockImplementation((name) => {
          if (name === 'HOMEPATH') return '/home/user';
          if (name === 'CONFIG') return 'config';
          return undefined;
        });
      
      const result = await resolver.resolve('$HOMEPATH/$CONFIG', context);
      expect(result).toBe('/home/user/config');
      expect(stateService.getPathVar).toHaveBeenCalledWith('HOMEPATH');
      expect(stateService.getPathVar).toHaveBeenCalledWith('CONFIG');
    });

    it('should handle $~ alias for $HOMEPATH', async () => {
      const result = await resolver.resolve('$~/config', context);
      expect(result).toBe('/home/user/config');
      expect(stateService.getPathVar).toHaveBeenCalledWith('HOMEPATH');
    });

    it('should handle $. alias for $PROJECTPATH', async () => {
      const result = await resolver.resolve('$./src', context);
      expect(result).toBe('/project/src');
      expect(stateService.getPathVar).toHaveBeenCalledWith('PROJECTPATH');
    });

    it('should handle path variables in middle of path', async () => {
      vi.mocked(stateService.getPathVar)
        .mockImplementation((name) => {
          if (name === 'HOMEPATH') return '/home/user';
          if (name === 'SUBDIR') return 'src';
          return undefined;
        });
      
      const result = await resolver.resolve('$HOMEPATH/$SUBDIR/file.txt', context);
      expect(result).toBe('/home/user/src/file.txt');
      expect(stateService.getPathVar).toHaveBeenCalledWith('HOMEPATH');
      expect(stateService.getPathVar).toHaveBeenCalledWith('SUBDIR');
    });
  });

  describe('error handling', () => {
    it('should throw when path variables are not allowed', async () => {
      context.allowedVariableTypes.path = false;

      await expect(resolver.resolve('$HOMEPATH', context))
        .rejects
        .toThrow('Path variables are not allowed in this context');
    });

    it('should throw on undefined path variable', async () => {
      vi.mocked(stateService.getPathVar)
        .mockImplementation((name) => undefined);

      await expect(resolver.resolve('$missing', context))
        .rejects
        .toThrow('Undefined path variable: missing');
    });

    it('should throw when path is not absolute but required', async () => {
      vi.mocked(stateService.getPathVar)
        .mockImplementation((name) => 'relative/path');

      await expect(resolver.resolve('$path', context))
        .rejects
        .toThrow('Path must be absolute');
    });

    it('should throw when path does not start with allowed root', async () => {
      vi.mocked(stateService.getPathVar)
        .mockImplementation((name) => {
          if (name === 'path') return '/other/path';
          if (name === 'HOMEPATH') return '/home/user';
          if (name === 'PROJECTPATH') return '/project';
          return undefined;
        });

      await expect(resolver.resolve('$path', context))
        .rejects
        .toThrow('Path must start with one of: HOMEPATH, PROJECTPATH');
    });
  });

  describe('extractReferences', () => {
    it('should extract simple path variable', () => {
      const refs = resolver.extractReferences('$HOMEPATH');
      expect(refs).toEqual(['HOMEPATH']);
    });

    it('should extract multiple path variables', () => {
      const refs = resolver.extractReferences('$HOMEPATH/to/$PROJECTPATH');
      expect(refs).toEqual(['HOMEPATH', 'PROJECTPATH']);
    });

    it('should handle $~ and $. aliases', () => {
      const refs = resolver.extractReferences('$~/config and $./src');
      expect(refs).toEqual(['~', '.']);
    });

    it('should extract path variables from middle of path', () => {
      const refs = resolver.extractReferences('/root/$PROJECTPATH/src');
      expect(refs).toEqual(['PROJECTPATH']);
    });

    it('should return empty array for no references', () => {
      const refs = resolver.extractReferences('/absolute/path');
      expect(refs).toEqual([]);
    });

    it('should only match valid path variable names', () => {
      const refs = resolver.extractReferences('$valid $123invalid $_valid');
      expect(refs).toEqual(['valid', '_valid']);
    });
  });
}); 