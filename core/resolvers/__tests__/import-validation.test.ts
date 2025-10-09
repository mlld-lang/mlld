import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ResolverManager } from '@core/resolvers/ResolverManager';
import { RegistryResolver } from '@core/resolvers/RegistryResolver';
import { HTTPResolver } from '@core/resolvers/HTTPResolver';
import { LocalResolver } from '@core/resolvers/LocalResolver';

describe('Import Content Type Validation', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  describe('Module Imports', () => {
    it('should accept module imports from .mld files', async () => {
      await fileSystem.writeFile('/lib.mld', '/var @greeting = "Hello from module"');
      
      const code = `
/import { greeting } from "./lib.mld"
/show @greeting
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('Hello from module');
    });

    it('should accept module imports with auto-export', async () => {
      await fileSystem.writeFile('/utils.mld', `
/var @helper = "Utility function"
/var @config = { enabled: true }
`);
      
      const code = `
/import "./utils.mld"
/show @utils.helper
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toContain('Utility function');
    });

    it('should accept module imports with explicit export', async () => {
      await fileSystem.writeFile('/module.mld', `
/var @internal = "Internal value"
/var @api = "Public API"
/var @version = "1.0.0"
/var @module = {
  api: @api,
  version: @version
}
`);
      
      const code = `
/import { api, version } from "./module.mld"
/show :::API: {{api}}, Version: {{version}}:::
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('API: Public API, Version: 1.0.0');
    });
  });

  describe('Non-Module Import Behavior', () => {
    it('should import plain text files as namespace with empty exports', async () => {
      await fileSystem.writeFile('/readme.txt', 'This is a plain text file');
      
      const code = `/import "./readme.txt" as @text
/show @text`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      // Plain text files should create an empty namespace object
      expect(result.trim()).toBe('{}');
    });

    it('should import JSON data files and access their properties', async () => {
      await fileSystem.writeFile('/config.json', '{"setting": "value"}');
      
      const code = `/import { setting } from "./config.json"
/show @setting`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('value');
    });

    it('should import markdown files without mlld directives as empty namespace', async () => {
      await fileSystem.writeFile('/doc.md', '# Documentation\n\nNo mlld content here.');
      
      const code = `/import "./doc.md"
/show @doc`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      // Markdown files without mlld directives should create an empty namespace
      expect(result.trim()).toBe('{}');
    });
  });

  describe('Registry Module Imports', () => {
    beforeEach(() => {
      // Mock fetch for registry modules
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
                  description: 'Test utilities',
                  about: 'Test utilities module',
                  needs: [],
                  license: 'CC0'
                },
                '@test/data': {
                  name: 'data',
                  author: 'test',
                  source: { 
                    url: 'https://example.com/data.json',
                    contentHash: 'def456ghi789'
                  },
                  description: 'Data file (not a module)',
                  about: 'Test data file',
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
            text: async () => '/var @version = "1.0.0"\n/var @name = "Utils"'
          } as any;
        }
        if (url.includes('/data.json')) {
          return {
            ok: true,
            text: async () => '{"type": "config"}'
          } as any;
        }
        throw new Error('Not found');
      };
    });

    it.skip('should accept registry module imports - Issue #254: Registry tests need isolation', async () => {
      // Set up resolver manager with all necessary resolvers
      const resolverManager = new ResolverManager();
      resolverManager.registerResolver(new LocalResolver(fileSystem));
      resolverManager.registerResolver(new HTTPResolver());
      resolverManager.registerResolver(new RegistryResolver());
      
      // Configure the test registry
      resolverManager.configurePrefixes([{
        prefix: '@test/',
        resolver: 'REGISTRY',
        type: 'module',
        config: {
          registryUrl: 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules'
        }
      }]);
      
      // Also configure HTTP resolver for the registry URLs
      resolverManager.configurePrefixes([{
        prefix: 'https:',
        resolver: 'HTTP',
        config: { baseUrl: 'https://example.com', headers: {} }
      }]);
      
      const code = `
/import { version, name } from @test/utils
/show ::{{name}} v{{version}}::
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        urlConfig: {
          enabled: true,
          allowedProtocols: ['https'],
          allowedDomains: [],
          blockedDomains: []
        },
        resolverManager
      });
      
      expect(result.trim()).toBe('Utils v1.0.0');
    });

    it('should reject imports from non-module registry entries', async () => {
      // Set up resolver manager for this test
      const resolverManager = new ResolverManager();
      resolverManager.registerResolver(new LocalResolver(fileSystem));
      resolverManager.registerResolver(new HTTPResolver());
      resolverManager.registerResolver(new RegistryResolver());
      
      // Configure the test registry
      resolverManager.configurePrefixes([{
        prefix: '@test/',
        resolver: 'REGISTRY',
        type: 'module',
        config: {
          registryUrl: 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules'
        }
      }]);
      
      // Also configure HTTP resolver for the registry URLs
      resolverManager.configurePrefixes([{
        prefix: 'https:',
        resolver: 'HTTP',
        config: { baseUrl: 'https://example.com', headers: {} }
      }]);
      
      const code = `/import { type } from @test/data
/show @type`;
      
      await expect(
        interpret(code, {
          fileSystem,
          pathService,
          basePath: '/',
          urlConfig: {
            enabled: true,
            allowedProtocols: ['https'],
            allowedDomains: [],
            blockedDomains: []
          },
          resolverManager
        })
      ).rejects.toThrow(/Import.*not found|Variable.*not found|Field.*not found/);
    });
  });

  describe('Built-in Resolver Imports', () => {
    it('should accept imports from now resolver', async () => {
      const code = `
/import { iso, date } from @now
/show :::Today is {{date}}:::
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toMatch(/Today is \d{4}-\d{2}-\d{2}/);
    });

    it.skip('should accept imports from DEBUG resolver - needs investigation', async () => {
      const code = `
/import { reduced } from @DEBUG
/show @reduced
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      // The reduced export should be a JSON string
      expect(result.trim()).toContain('{');
      expect(result.trim()).toContain('}');
    });

    it('should accept imports from INPUT resolver', async () => {
      const code = `
/import { test } from @INPUT
/show :::Input value: {{test}}:::
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/',
        stdinContent: '{"test": "Hello from stdin"}'
      });
      
      expect(result.trim()).toBe('Input value: Hello from stdin');
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error for missing variables in text file imports', async () => {
      await fileSystem.writeFile('/plain.txt', 'Just text');
      
      const code = `/import { content } from "./plain.txt"
/show @content`;
      
      try {
        await interpret(code, {
          fileSystem,
          pathService,
          basePath: '/'
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toMatch(/Import.*content.*not found|Variable.*content.*not found/);
      }
    });

    it('should successfully import keys from JSON data files', async () => {
      await fileSystem.writeFile('/data.json', '{"key": "value"}');
      
      const code = `/import { key } from "./data.json"
/show @key`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('value');
    });
  });
});
