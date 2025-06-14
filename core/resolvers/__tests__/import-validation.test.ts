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
      await fileSystem.writeFile('/lib.mld', '@text greeting = "Hello from module"');
      
      const code = `
@import { greeting } from "./lib.mld"
@add @greeting
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
@text helper = "Utility function"
@data config = { enabled: true }
`);
      
      const code = `
@import { * } from "./utils.mld"
@add @helper
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
@text internal = "Internal value"
@text api = "Public API"
@text version = "1.0.0"
@data module = {
  api: @api,
  version: @version
}
`);
      
      const code = `
@import { api, version } from "./module.mld"
@add [[API: {{api}}, Version: {{version}}]]
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
    it('should import plain text files but find no variables', async () => {
      await fileSystem.writeFile('/readme.txt', 'This is a plain text file');
      
      const code = `@import { * } from "./readme.txt"
@add @content`;
      
      await expect(
        interpret(code, {
          fileSystem,
          pathService,
          basePath: '/'
        })
      ).rejects.toThrow(/Variable.*not found/);
    });

    it('should import JSON data files and access their properties', async () => {
      await fileSystem.writeFile('/config.json', '{"setting": "value"}');
      
      const code = `@import { setting } from "./config.json"
@add @setting`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('value');
    });

    it('should import markdown files without mlld but find no variables', async () => {
      await fileSystem.writeFile('/doc.md', '# Documentation\n\nNo mlld content here.');
      
      const code = `@import { * } from "./doc.md"
@add @title`;
      
      await expect(
        interpret(code, {
          fileSystem,
          pathService,
          basePath: '/'
        })
      ).rejects.toThrow(/Variable.*not found/);
    });
  });

  describe('Registry Module Imports', () => {
    beforeEach(() => {
      // Mock fetch for registry modules
      global.fetch = async (url: string) => {
        if (url.includes('/registry.json')) {
          return {
            ok: true,
            json: async () => ({
              author: 'test',
              modules: {
                utils: {
                  source: { url: 'https://example.com/utils.mld' },
                  description: 'Test utilities'
                },
                data: {
                  source: { url: 'https://example.com/data.json' },
                  description: 'Data file (not a module)'
                }
              }
            })
          } as any;
        }
        if (url.includes('/utils.mld')) {
          return {
            ok: true,
            text: async () => '@text version = "1.0.0"\n@text name = "Utils"'
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
      resolverManager.configureRegistries([{
        prefix: '@test/',
        resolver: 'REGISTRY',
        type: 'input',
        config: {
          registryUrl: 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules'
        }
      }]);
      
      // Also configure HTTP resolver for the registry URLs
      resolverManager.configureRegistries([{
        prefix: 'https:',
        resolver: 'HTTP',
        type: 'input',
        config: { baseUrl: 'https://example.com', headers: {} }
      }]);
      
      const code = `
@import { version, name } from @test/utils
@add [[{{name}} v{{version}}]]
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

    it('should import registry data files but find no variables', async () => {
      const code = `@import { * } from @test/data
@add @type`;
      
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
          }
        })
      ).rejects.toThrow(/Variable.*not found/);
    });
  });

  describe('Built-in Resolver Imports', () => {
    it('should accept imports from TIME resolver', async () => {
      const code = `
@import { iso, date } from @TIME
@add [[Today is {{date}}]]
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toMatch(/Today is \d{4}-\d{2}-\d{2}/);
    });

    it('should accept imports from DEBUG resolver', async () => {
      const code = `
@import { reduced } from @DEBUG
@add @reduced
`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      // The reduced export contains JSON with environment and version
      expect(result.trim()).toContain('"environment"');
      expect(result.trim()).toContain('"version"');
    });

    it('should accept imports from INPUT resolver', async () => {
      const code = `
@import { test } from @INPUT
@add [[Input value: {{test}}]]
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
      
      const code = `@import { content } from "./plain.txt"
@add @content`;
      
      try {
        await interpret(code, {
          fileSystem,
          pathService,
          basePath: '/'
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toMatch(/Variable.*content.*not found/);
      }
    });

    it('should successfully import keys from JSON data files', async () => {
      await fileSystem.writeFile('/data.json', '{"key": "value"}');
      
      const code = `@import { key } from "./data.json"
@add @key`;
      
      const result = await interpret(code, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('value');
    });
  });
});