import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { container, DependencyContainer } from 'tsyringe';
import { PathService } from '@services/fs/PathService/PathService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver';
import type { PathValidationContext } from '@core/types/paths';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectBuilder } from '@tests/utils/ASTFixtureLoader';

describe('PathService - Fixture Tests', () => {
  let testContainer: DependencyContainer;
  let pathService: IPathService;
  let mockProjectPathResolver: ProjectPathResolver;
  let mockFsClientFactory: FileSystemServiceClientFactory;
  let mockUrlContentResolver: IURLContentResolver;

  beforeEach(() => {
    // Create a test container
    testContainer = container.createChildContainer();

    // Create mocks
    mockProjectPathResolver = {
      getProjectPath: vi.fn().mockReturnValue('/test/project'),
    } as unknown as ProjectPathResolver;

    mockFsClientFactory = {
      createClient: vi.fn().mockReturnValue({
        exists: vi.fn().mockResolvedValue(true),
        isDirectory: vi.fn().mockResolvedValue(false),
      }),
    } as unknown as FileSystemServiceClientFactory;

    mockUrlContentResolver = {
      isURL: vi.fn((path) => /^https?:\/\//i.test(path)),
      validateURL: vi.fn().mockResolvedValue('https://example.com'),
      fetchURL: vi.fn().mockResolvedValue({
        content: 'test content',
        headers: {},
        statusCode: 200,
      }),
    } as unknown as IURLContentResolver;

    // Register dependencies
    testContainer.registerInstance(ProjectPathResolver, mockProjectPathResolver);
    testContainer.registerInstance(FileSystemServiceClientFactory, mockFsClientFactory);
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', mockUrlContentResolver);

    // Create the service
    pathService = testContainer.resolve(PathService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Path resolution with fixtures', () => {
    it('should resolve simple relative paths', async () => {
      const projectBuilder = loadProjectBuilder(fs, 'path-assignment-1.fixture.json');
      const fixture = projectBuilder.fixtures['path-assignment-1.fixture.json'];
      const directive = fixture.ast[0];

      expect(directive.kind).toBe('path');
      expect(directive.raw.path).toBe('file.md');

      // Test resolution (passing raw path string)
      const resolved = pathService.resolvePath(directive.raw.path);
      expect(resolved).toBe('/test/project/file.md');
    });

    it('should resolve absolute paths', async () => {
      const projectBuilder = loadProjectBuilder(fs, 'path-assignment-absolute-1.fixture.json');
      const fixture = projectBuilder.fixtures['path-assignment-absolute-1.fixture.json'];
      const directive = fixture.ast[0];

      expect(directive.raw.path).toBe('/absolute/path/file.md');

      const resolved = pathService.resolvePath(directive.raw.path);
      expect(resolved).toBe('/absolute/path/file.md');
    });

    it('should resolve project-relative paths', async () => {
      const projectBuilder = loadProjectBuilder(fs, 'path-assignment-project-1.fixture.json');
      const fixture = projectBuilder.fixtures['path-assignment-project-1.fixture.json'];
      const directive = fixture.ast[0];

      expect(directive.raw.path).toMatch(/^\$PROJECTPATH/);

      const resolved = pathService.resolvePath(directive.raw.path);
      expect(resolved).toBe('/test/project/src/file.md');
    });

    it('should resolve special variable paths', async () => {
      const projectBuilder = loadProjectBuilder(fs, 'path-assignment-special-1.fixture.json');
      const fixture = projectBuilder.fixtures['path-assignment-special-1.fixture.json'];
      const directive = fixture.ast[0];

      // Mock home path
      const pathServiceInternal = pathService as PathService;
      pathServiceInternal.setHomePath('/home/user');

      expect(directive.raw.path).toMatch(/^\$~\//);

      const resolved = pathService.resolvePath(directive.raw.path);
      expect(resolved).toBe('/home/user/documents/file.md');
    });

    it('should handle paths with variables', async () => {
      const projectBuilder = loadProjectBuilder(fs, 'path-assignment-variable-1.fixture.json');
      const fixture = projectBuilder.fixtures['path-assignment-variable-1.fixture.json'];
      const directive = fixture.ast[0];

      // This test shows that the raw path contains the unresolved variable
      expect(directive.raw.path).toContain('{{');
      
      // The service should handle the base path resolution
      // Variable resolution would be handled by ResolutionService
      // For now, we just test it doesn't break on variable paths
      expect(() => pathService.resolvePath(directive.raw.path)).not.toThrow();
    });
  });

  describe('Path validation with fixtures', () => {
    it('should validate existing paths', async () => {
      const context: PathValidationContext = {
        workingDirectory: '/test/project',
        allowExternalPaths: false,
        rules: {
          mustExist: true,
          mustBeFile: true,
          mustBeDirectory: false,
        },
      };

      const mockFsClient = mockFsClientFactory.createClient();
      vi.mocked(mockFsClient.exists).mockResolvedValue(true);
      vi.mocked(mockFsClient.isDirectory).mockResolvedValue(false);

      const result = await pathService.validatePath('test.md', context);
      expect(result.exists).toBe(true);
      expect(result.isSecure).toBe(true);
    });

    it('should reject paths outside project when allowExternalPaths is false', async () => {
      const context: PathValidationContext = {
        workingDirectory: '/test/project',
        allowExternalPaths: false,
        rules: {
          mustExist: false,
          mustBeFile: false,
          mustBeDirectory: false,
        },
      };

      await expect(pathService.validatePath('/outside/path', context))
        .rejects.toThrow('outside');
    });

    it('should handle URL detection', async () => {
      const context: PathValidationContext = {
        workingDirectory: '/test/project',
        allowExternalPaths: true,
        rules: {
          mustExist: false,
          mustBeFile: false,
          mustBeDirectory: false,
        },
      };

      // URLs should be rejected by validatePath method
      await expect(pathService.validatePath('https://example.com', context))
        .rejects.toThrow('Expected filesystem path');
    });
  });

  describe('Special path methods', () => {
    it('should normalize paths correctly', () => {
      const pathServiceInternal = pathService as PathService;
      
      expect(pathServiceInternal.normalizePath('path\\to\\file')).toBe('path/to/file');
      expect(pathServiceInternal.normalizePath('path/./to/../file')).toBe('path/file');
      expect(pathServiceInternal.normalizePath('/path/')).toBe('/path/');
    });

    it('should handle path variables detection', () => {
      const pathServiceInternal = pathService as PathService;
      
      expect(pathServiceInternal.hasPathVariables('$PROJECTPATH/file')).toBe(true);
      expect(pathServiceInternal.hasPathVariables('$~/file')).toBe(true);
      expect(pathServiceInternal.hasPathVariables('~/file')).toBe(true);
      expect(pathServiceInternal.hasPathVariables('regular/file')).toBe(false);
    });

    it('should join paths correctly', () => {
      expect(pathService.joinPaths('path', 'to', 'file')).toBe('path/to/file');
      expect(pathService.joinPaths('/absolute', 'path')).toBe('/absolute/path');
    });

    it('should get dirname correctly', () => {
      expect(pathService.dirname('/path/to/file.txt')).toBe('/path/to');
      expect(pathService.dirname('relative/file.txt')).toBe('relative');
    });

    it('should get basename correctly', () => {
      expect(pathService.basename('/path/to/file.txt')).toBe('file.txt');
      expect(pathService.basename('file.txt')).toBe('file.txt');
    });
  });

  describe('URL handling', () => {
    it('should detect URLs correctly', () => {
      expect(pathService.isURL('https://example.com')).toBe(true);
      expect(pathService.isURL('http://example.com')).toBe(true);
      expect(pathService.isURL('/path/to/file')).toBe(false);
    });

    it('should validate URLs', async () => {
      const validated = await pathService.validateURL('https://example.com');
      expect(validated).toBe('https://example.com');
      expect(mockUrlContentResolver.validateURL).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('should fetch URL content', async () => {
      const response = await pathService.fetchURL('https://example.com');
      expect(response.content).toBe('test content');
      expect(mockUrlContentResolver.fetchURL).toHaveBeenCalledWith('https://example.com', undefined);
    });
  });
});