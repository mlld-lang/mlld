import { describe, it, expect, beforeEach } from 'vitest';
import { ResolverManager } from '@core/resolvers/ResolverManager';
import { NowResolver, DebugResolver, InputResolver } from '@core/resolvers/builtin';
import { LocalResolver } from '@core/resolvers/LocalResolver';
import { RegistryResolver } from '@core/resolvers/RegistryResolver';
import { ProjectPathResolver } from '@core/resolvers/ProjectPathResolver';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('Context-Dependent Behavior', () => {
  let resolverManager: ResolverManager;
  let fileSystem: MemoryFileSystem;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    resolverManager = new ResolverManager();
  });

  describe('now Resolver', () => {
    beforeEach(() => {
      resolverManager.registerResolver(new NowResolver());
      // Configure now resolver
      resolverManager.configurePrefixes([{
        prefix: '@now',
        resolver: 'now',
              }]);
    });

    it('returns text in variable context', async () => {
      const result = await resolverManager.resolve('@now', { context: 'variable' });
      
      expect(result.content.contentType).toBe('text');
      expect(typeof result.content.content).toBe('string');
      // Should be an ISO timestamp
      expect(result.content.content).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('returns data in import context', async () => {
      const result = await resolverManager.resolve('@now', { context: 'import' });
      
      expect(result.content.contentType).toBe('data');
      // Should be JSON with time formats
      const data = JSON.parse(result.content.content);
      expect(data).toHaveProperty('iso');
      expect(data).toHaveProperty('unix');
      expect(data).toHaveProperty('date');
      expect(data).toHaveProperty('time');
    });

    it('returns data in path context (not typical use)', async () => {
      const result = await resolverManager.resolve('@now', { context: 'path' });
      
      // Path context should return the default (variable) behavior
      expect(result.content.contentType).toBe('text');
    });
  });

  describe('debug Resolver', () => {
    beforeEach(() => {
      resolverManager.registerResolver(new DebugResolver());
      // Configure debug resolver
      resolverManager.configurePrefixes([{
        prefix: '@debug',
        resolver: 'debug',
              }]);
    });

    it('returns data in variable context', async () => {
      const result = await resolverManager.resolve('@debug', { context: 'variable' });
      
      expect(result.content.contentType).toBe('data');
      const data = JSON.parse(result.content.content);
      expect(data).toHaveProperty('environment');
      expect(data).toHaveProperty('version');
    });

    it('returns data in import context', async () => {
      const result = await resolverManager.resolve('@debug', { context: 'import' });
      
      expect(result.content.contentType).toBe('data');
      const data = JSON.parse(result.content.content);
      // Import context should provide debug exports
      expect(data).toHaveProperty('json');
      expect(data).toHaveProperty('reduced');
      expect(data).toHaveProperty('markdown');
    });
  });

  describe('input Resolver', () => {
    beforeEach(() => {
      const inputResolver = new InputResolver('{"config": "test"}');
      resolverManager.registerResolver(inputResolver);
      // Configure input resolver
      resolverManager.configurePrefixes([{
        prefix: '@input',
        resolver: 'input',
              }]);
    });

    it('returns appropriate type in variable context', async () => {
      const result = await resolverManager.resolve('@input', { context: 'variable' });
      
      expect(result.content.contentType).toBe('data');
      expect(result.content.content).toContain('config');
    });

    it('returns data in import context', async () => {
      const result = await resolverManager.resolve('@input', { context: 'import' });
      
      expect(result.content.contentType).toBe('data');
      const data = JSON.parse(result.content.content);
      expect(data).toHaveProperty('config');
    });
  });

  describe('LocalResolver Context Support', () => {
    let localResolver: LocalResolver;

    beforeEach(async () => {
      localResolver = new LocalResolver(fileSystem);
      resolverManager.registerResolver(localResolver);
      
      // Configure LOCAL resolver with basePath
      resolverManager.configurePrefixes([{
        prefix: '/',
        resolver: 'LOCAL',
        type: 'input',
        config: { basePath: '/' }
      }]);
      
      await fileSystem.writeFile('/module.mld', '/var @greeting = "Hello"');
      await fileSystem.writeFile('/data.json', '{"key": "value"}');
      await fileSystem.writeFile('/text.txt', 'Plain text');
    });

    it('supports import context for modules', async () => {
      const result = await resolverManager.resolve('/module.mld', { context: 'import' });
      
      expect(result.content.contentType).toBe('module');
      expect(result.resolverName).toBe('LOCAL');
    });

    it('supports path context for all file types', async () => {
      const textResult = await resolverManager.resolve('/text.txt', { context: 'path' });
      expect(textResult.content.contentType).toBe('text');
      
      const dataResult = await resolverManager.resolve('/data.json', { context: 'path' });
      expect(dataResult.content.contentType).toBe('data');
      
      // Modules can be referenced in path context too (though not recommended)
      const moduleResult = await resolverManager.resolve('/module.mld', { context: 'path' });
      expect(moduleResult.content.contentType).toBe('module');
    });

    it('supports variable context', async () => {
      const result = await resolverManager.resolve('/data.json', { context: 'variable' });
      
      expect(result.content.contentType).toBe('data');
    });
  });

  describe('RegistryResolver Context Support', () => {
    beforeEach(() => {
      resolverManager.registerResolver(new RegistryResolver());
      
      // Configure REGISTRY resolver
      resolverManager.configurePrefixes([{
        prefix: '@test/',
        resolver: 'REGISTRY',
        type: 'module',
        config: {}
      }]);
      
      // Mock fetch
      global.fetch = async (url: string) => {
        if (url.includes('/modules.json')) {
          return {
            ok: true,
            json: async () => ({
              version: '1.0.0',
              modules: {
                '@test/utils': {
                  name: 'utils',
                  author: 'test',
                  source: { 
                    url: 'https://example.com/utils.mld',
                    contentHash: 'abc123def456'
                  },
                  description: 'Utilities',
                  about: 'Test utilities module',
                  needs: [],
                  license: 'CC0'
                }
              }
            })
          } as any;
        }
        if (url.includes('/utils.mld')) {
          return {
            ok: true,
            text: async () => '/var @version = "1.0.0"'
          } as any;
        }
        throw new Error('Not found');
      };
    });

    it('supports import context', async () => {
      const result = await resolverManager.resolve('@test/utils', { context: 'import' });
      
      expect(result.content.contentType).toBe('module');
      expect(result.resolverName).toBe('REGISTRY');
    });

    it('does not support path context', async () => {
      // Registry modules should not be used in path directives
      await expect(
        resolverManager.resolve('@test/utils', { context: 'path' })
      ).rejects.toThrow();
    });
  });

  describe('ProjectPathResolver Context Support', () => {
    beforeEach(async () => {
      resolverManager.registerResolver(new ProjectPathResolver(fileSystem));
      
      await fileSystem.mkdir('/project');
      await fileSystem.writeFile('/project/package.json', '{"name": "test"}');
      await fileSystem.writeFile('/project/src/index.ts', 'export {}');
    });

    it('supports path context', async () => {
      resolverManager.configurePrefixes([{
        prefix: '@base',
        resolver: 'base',
        config: { basePath: '/project' }
      }]);
      
      const result = await resolverManager.resolve('@base/src/index.ts', { context: 'path' });
      
      expect(result.content.contentType).toBe('text');
      expect(result.content.content).toBe('export {}');
    });

    it('supports import context for modules', async () => {
      await fileSystem.writeFile('/project/lib.mld', '/var @name = "lib"');
      
      resolverManager.configurePrefixes([{
        prefix: '@base',
        resolver: 'base',
        config: { basePath: '/project' }
      }]);
      
      const result = await resolverManager.resolve('@base/lib.mld', { context: 'import' });
      
      expect(result.content.contentType).toBe('module');
    });
  });

  describe('Unsupported Context Errors', () => {
    beforeEach(() => {
      // Create a mock output-only resolver
      const outputResolver = {
        name: 'OUTPUT_ONLY',
        type: 'output' as const,
        capabilities: {
          io: { read: false, write: true, list: false },
          contexts: { import: false, path: false, output: true },
          supportedContentTypes: ['text'],
          defaultContentType: 'text' as const,
          priority: 100
        },
        canResolve: (ref: string) => ref === '@OUTPUT_ONLY',
        resolve: async () => ({ content: '', contentType: 'text' as const }),
        write: async () => {}
      };
      
      resolverManager.registerResolver(outputResolver);
      
      // Configure OUTPUT_ONLY resolver
      resolverManager.configurePrefixes([{
        prefix: '@OUTPUT_ONLY',
        resolver: 'OUTPUT_ONLY',
        type: 'output'
      }]);
    });

    it('throws error for unsupported resolver operations', async () => {
      await expect(
        resolverManager.resolve('@OUTPUT_ONLY', { context: 'import' })
      ).rejects.toThrow('No resolver found');
    });
  });
});