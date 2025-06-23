import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ResolverManager } from '@core/resolvers/ResolverManager';
import { LocalResolver } from '@core/resolvers/LocalResolver';
import { ProjectPathResolver } from '@core/resolvers/ProjectPathResolver';
import { HTTPResolver } from '@core/resolvers/HTTPResolver';
import { RegistryResolver } from '@core/resolvers/RegistryResolver';

describe('Path Content Type Validation', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  let resolverManager: ResolverManager;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    
    // Set up resolver manager with local resolver
    resolverManager = new ResolverManager();
    resolverManager.registerResolver(new LocalResolver(fileSystem));
    resolverManager.registerResolver(new ProjectPathResolver(fileSystem));
    resolverManager.registerResolver(new HTTPResolver());
    resolverManager.registerResolver(new RegistryResolver());
    
    // Configure LOCAL resolver
    resolverManager.configurePrefixes([
      {
        prefix: '/',
        resolver: 'LOCAL',
        config: { basePath: '/' }
      },
      {
        prefix: './',
        resolver: 'LOCAL',
        config: { basePath: '/' }
      }
    ]);
    
    // Configure PROJECTPATH resolver
    resolverManager.configurePrefixes([{
      prefix: '@PROJECTPATH',
      resolver: 'PROJECTPATH',
      config: { basePath: '/' }
    }]);
    
    // Configure HTTP resolver
    resolverManager.configurePrefixes([{
      prefix: 'https:',
      resolver: 'HTTP',
      config: { baseUrl: 'https://example.com', headers: {} }
    }]);
  });

  describe('Valid Path Content', () => {
    it('should accept text files in path directives', async () => {
      await fileSystem.writeFile('/readme.txt', 'This is a readme file');
      
      const code = `
/path @readme = "./readme.txt"
/add @readme
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      });
      
      expect(result.trim()).toBe('This is a readme file');
    });

    it('should accept JSON data files in path directives', async () => {
      await fileSystem.writeFile('/config.json', '{"setting": "value"}');
      
      const code = `
/path @config = "./config.json"
/add @config
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      });
      
      expect(result.trim()).toBe('{"setting": "value"}');
    });

    it('should handle @PROJECTPATH references', async () => {
      await fileSystem.mkdir('/project');
      await fileSystem.writeFile('/project/package.json', '{"name": "test-project"}');
      await fileSystem.writeFile('/project/src/data.txt', 'Project data');
      
      const code = `
/path @data = "@PROJECTPATH/src/data.txt"
/add @data
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/project/src',
        resolverManager
      });
      
      expect(result.trim()).toBe('Project data');
    });
  });

  describe('Module Files in Paths', () => {
    it('should accept module files in path directives as text content', async () => {
      await fileSystem.writeFile('/module.mld', '/text @greeting = "Hello"');
      
      const code = `/path @mod = "./module.mld"
/add @mod`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      });
      
      expect(result.trim()).toBe('/text @greeting = "Hello"');
    });

    it('should accept .mlld module files in path directives as text content', async () => {
      await fileSystem.writeFile('/module.mlld', '/data @config = { enabled: true }');
      
      const code = `/path @mod = "./module.mlld"
/add @mod`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      });
      
      expect(result.trim()).toBe('/data @config = { enabled: true }');
    });

    it('should reject invalid syntax for registry modules in path directives', async () => {
      // The syntax @path mod = @test/utils is invalid - path expects a quoted string
      const code = `/path @mod = @test/utils`;
      
      await expect(
        interpret(code, {
          fileSystem,
          pathService,
          basePath: '/',
          resolverManager
        })
      ).rejects.toThrow(); // Will throw a parse error
    });
  });

  describe('Resolver Path Support', () => {
    it.skip('should accept TIME resolver in paths (returns text) - invalid syntax', async () => {
      const code = `
/path @timestamp = @TIME
/add [[Timestamp path: {{timestamp}}]]
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      });
      
      // TIME in path context returns ISO timestamp as text
      expect(result).toMatch(/Timestamp path: \d{4}-\d{2}-\d{2}T/);
    });

    it.skip('should accept DEBUG resolver in paths (returns data) - invalid syntax', async () => {
      const code = `
/path @debug = @DEBUG
/data @parsed = @debug
/add [[Debug type: {{parsed.project.basePath}}]]
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      });
      
      expect(result).toContain('Debug type: /');
    });

    it.skip('should accept INPUT resolver in paths - invalid syntax', async () => {
      const code = `
/path @input = @INPUT
/data @parsed = @input
/add [[Input data: {{parsed.test}}]]
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        stdinContent: '{"test": "path input"}'
      });
      
      expect(result).toBe('Input data: path input');
    });
  });

  describe('URL Paths', () => {
    beforeEach(() => {
      // Mock fetch for URLs
      global.fetch = async (url: string) => {
        if (url.includes('/data.txt')) {
          return {
            ok: true,
            text: async () => 'URL text content'
          } as any;
        }
        if (url.includes('/config.json')) {
          return {
            ok: true,
            text: async () => '{"url": "data"}'
          } as any;
        }
        if (url.includes('/module.mld')) {
          return {
            ok: true,
            text: async () => '/text @greeting = "URL module"'
          } as any;
        }
        throw new Error('Not found');
      };
    });

    it('should accept text URLs in path directives', async () => {
      const code = `
/path @data = "https://example.com/data.txt"
/add @data
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager,
        urlConfig: {
          enabled: true,
          allowedProtocols: ['https'],
          allowedDomains: [],
          blockedDomains: []
        }
      });
      
      expect(result.trim()).toBe('URL text content');
    });

    it('should accept data URLs in path directives', async () => {
      const code = `
/path @config = "https://example.com/config.json"
/add @config
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager,
        urlConfig: {
          enabled: true,
          allowedProtocols: ['https'],
          allowedDomains: [],
          blockedDomains: []
        }
      });
      
      expect(result.trim()).toBe('{"url": "data"}');
    });

    it('should accept module URLs in path directives as text content', async () => {
      const code = `/path @mod = "https://example.com/module.mld"
/add @mod`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager,
        urlConfig: {
          enabled: true,
          allowedProtocols: ['https'],
          allowedDomains: [],
          blockedDomains: []
        }
      });
      
      expect(result.trim()).toBe('/text @greeting = "URL module"');
    });
  });

  describe('Path File Access', () => {
    it('should successfully read .mld files in path directives', async () => {
      await fileSystem.writeFile('/lib.mld', '/text @name = "Library"');
      
      const code = `/path @lib = "./lib.mld"
/add @lib`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      });
      
      expect(result.trim()).toBe('/text @name = "Library"');
    });

    it('should handle mixed file references', async () => {
      await fileSystem.writeFile('/data.txt', 'Text data');
      await fileSystem.writeFile('/module.mld', '/text @mod = "Module"');
      
      const code = `
/path @text = "./data.txt"
/path @mod = "./module.mld"
/add @text
/add @mod
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      });
      
      expect(result.trim()).toBe('Text data\n/text @mod = "Module"');
    });
  });
});