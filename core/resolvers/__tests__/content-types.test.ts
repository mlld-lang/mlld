import { describe, it, expect, beforeEach } from 'vitest';
import { ResolverManager } from '@core/resolvers/ResolverManager';
import { LocalResolver } from '@core/resolvers/LocalResolver';
import { GitHubResolver } from '@core/resolvers/GitHubResolver';
import { HTTPResolver } from '@core/resolvers/HTTPResolver';
import { RegistryResolver } from '@core/resolvers/RegistryResolver';
import { TimeResolver, DebugResolver, InputResolver } from '@core/resolvers/builtin';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('Content Type Detection', () => {
  let resolverManager: ResolverManager;
  let fileSystem: MemoryFileSystem;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    resolverManager = new ResolverManager();
  });

  describe('LocalResolver', () => {
    let localResolver: LocalResolver;

    beforeEach(async () => {
      localResolver = new LocalResolver(fileSystem);
      resolverManager.registerResolver(localResolver);
      
      // Configure LOCAL resolver with basePath
      resolverManager.configureRegistries([{
        prefix: '/',
        resolver: 'LOCAL',
        type: 'input',
        config: { basePath: '/' }
      }]);
    });

    it('should detect .mld files as modules', async () => {
      await fileSystem.writeFile('/test.mld', '@text greeting = "Hello"');
      
      const result = await resolverManager.resolve('/test.mld');
      
      expect(result.content.contentType).toBe('module');
      expect(result.resolverName).toBe('LOCAL');
    });

    it('should detect .mlld files as modules', async () => {
      await fileSystem.writeFile('/test.mlld', '@text greeting = "Hello"');
      
      const result = await resolverManager.resolve('/test.mlld');
      
      expect(result.content.contentType).toBe('module');
    });

    it('should detect .json files as data', async () => {
      await fileSystem.writeFile('/config.json', '{"key": "value"}');
      
      const result = await resolverManager.resolve('/config.json');
      
      expect(result.content.contentType).toBe('data');
    });

    it('should detect mlld modules by content parsing', async () => {
      await fileSystem.writeFile('/module.txt', '@data module = { greeting: "Hello" }');
      
      const result = await resolverManager.resolve('/module.txt');
      
      expect(result.content.contentType).toBe('module');
    });

    it('should detect JSON content as data', async () => {
      await fileSystem.writeFile('/data.txt', '{"isJson": true}');
      
      const result = await resolverManager.resolve('/data.txt');
      
      expect(result.content.contentType).toBe('data');
    });

    it('should detect plain text as text', async () => {
      await fileSystem.writeFile('/readme.txt', 'This is a plain text file');
      
      const result = await resolverManager.resolve('/readme.txt');
      
      expect(result.content.contentType).toBe('text');
    });
  });

  describe('GitHubResolver', () => {
    let githubResolver: GitHubResolver;

    beforeEach(() => {
      githubResolver = new GitHubResolver();
      resolverManager.registerResolver(githubResolver);
      
      // Configure GITHUB resolver
      resolverManager.configureRegistries([{
        prefix: 'github:',
        resolver: 'GITHUB',
        type: 'input',
        config: { repository: 'test-owner/test-repo' }
      }]);
      
      // Mock fetch for tests
      global.fetch = async (url: string) => {
        // Mock repository API check
        if (url === 'https://api.github.com/repos/test-owner/test-repo') {
          return {
            ok: true,
            json: async () => ({ name: 'test-repo', private: false, default_branch: 'main' })
          } as any;
        }
        // Mock contents API for GitHub
        if (url.includes('/contents/') && url.includes('/module.mld')) {
          return {
            ok: true,
            json: async () => ({
              type: 'file',
              content: Buffer.from('@text greeting = "Hello from GitHub"').toString('base64'),
              encoding: 'base64'
            }),
            headers: {
              get: (name: string) => name === 'etag' ? '"abc123"' : null
            }
          } as any;
        }
        if (url.includes('/contents/') && url.includes('/data.json')) {
          return {
            ok: true,
            json: async () => ({
              type: 'file',
              content: Buffer.from('{"source": "github"}').toString('base64'),
              encoding: 'base64'
            }),
            headers: {
              get: (name: string) => name === 'etag' ? '"def456"' : null
            }
          } as any;
        }
        if (url.includes('/contents/') && url.includes('/plain.txt')) {
          return {
            ok: true,
            json: async () => ({
              type: 'file',
              content: Buffer.from('Plain text content').toString('base64'),
              encoding: 'base64'
            }),
            headers: {
              get: (name: string) => name === 'etag' ? '"ghi789"' : null
            }
          } as any;
        }
        // Keep old mocks for backward compatibility
        if (url.includes('/module.mld')) {
          return {
            ok: true,
            text: async () => '@text greeting = "Hello from GitHub"',
            headers: {
              get: (name: string) => name === 'etag' ? '"abc123"' : null
            }
          } as any;
        }
        if (url.includes('/data.json')) {
          return {
            ok: true,
            text: async () => '{"source": "github"}',
            headers: {
              get: (name: string) => name === 'etag' ? '"def456"' : null
            }
          } as any;
        }
        if (url.includes('/plain.txt')) {
          return {
            ok: true,
            text: async () => 'Plain text content',
            headers: {
              get: (name: string) => name === 'etag' ? '"ghi789"' : null
            }
          } as any;
        }
        throw new Error('Not found');
      };
    });

    it('should detect .mld files from GitHub as modules', async () => {
      const result = await resolverManager.resolve('github:user/repo/module.mld');
      
      expect(result.content.contentType).toBe('module');
      expect(result.resolverName).toBe('GITHUB');
    });

    it('should detect .json files from GitHub as data', async () => {
      const result = await resolverManager.resolve('github:user/repo/data.json');
      
      expect(result.content.contentType).toBe('data');
    });

    it('should detect other files from GitHub as text', async () => {
      const result = await resolverManager.resolve('github:user/repo/plain.txt');
      
      expect(result.content.contentType).toBe('text');
    });
  });

  describe('HTTPResolver', () => {
    let httpResolver: HTTPResolver;

    beforeEach(() => {
      httpResolver = new HTTPResolver();
      resolverManager.registerResolver(httpResolver);
      
      // Configure HTTP resolver with example.com as base
      resolverManager.configureRegistries([{
        prefix: 'https://example.com/',
        resolver: 'HTTP',
        type: 'input',
        config: { 
          baseUrl: 'https://example.com',
          validateSSL: false // For testing
        } 
      }]);
      
      // Mock fetch for tests
      global.fetch = async (url: string) => {
        const mockHeaders = new Map([
          ['content-type', 'text/plain']
        ]);
        
        if (url.endsWith('.mld')) {
          return {
            ok: true,
            status: 200,
            headers: {
              get: (name: string) => mockHeaders.get(name.toLowerCase()),
              forEach: (fn: any) => mockHeaders.forEach((v, k) => fn(v, k))
            },
            text: async () => '@data module = { version: "1.0.0" }'
          } as any;
        }
        if (url.endsWith('.json')) {
          return {
            ok: true,
            status: 200,
            headers: {
              get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null,
              forEach: (fn: any) => fn('application/json', 'content-type')
            },
            text: async () => '{"type": "config"}'
          } as any;
        }
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => mockHeaders.get(name.toLowerCase()),
            forEach: (fn: any) => mockHeaders.forEach((v, k) => fn(v, k))
          },
          text: async () => 'Just plain text content'
        } as any;
      };
    });

    it('should detect .mld files from HTTP as modules', async () => {
      const result = await resolverManager.resolve('https://example.com/module.mld');
      
      expect(result.content.contentType).toBe('module');
      expect(result.resolverName).toBe('HTTP');
    });

    it('should detect .json files from HTTP as data', async () => {
      const result = await resolverManager.resolve('https://example.com/config.json');
      
      expect(result.content.contentType).toBe('data');
    });

    it('should detect other HTTP content as text', async () => {
      const result = await resolverManager.resolve('https://example.com/readme.txt');
      
      expect(result.content.contentType).toBe('text');
    });
  });

  describe('RegistryResolver', () => {
    let registryResolver: RegistryResolver;

    beforeEach(() => {
      registryResolver = new RegistryResolver();
      resolverManager.registerResolver(registryResolver);
      
      // Configure REGISTRY resolver
      resolverManager.configureRegistries([{
        prefix: '@test/',
        resolver: 'REGISTRY',
        type: 'input'
      }]);
      
      // Mock fetch for registry
      global.fetch = async (url: string) => {
        if (url.includes('/registry.json')) {
          return {
            ok: true,
            json: async () => ({
              author: 'test',
              modules: {
                utils: {
                  source: { url: 'https://example.com/utils.mld' },
                  description: 'Utility module'
                }
              }
            })
          } as any;
        }
        if (url.includes('/utils.mld')) {
          return {
            ok: true,
            text: async () => '@text version = "1.0.0"'
          } as any;
        }
        throw new Error('Not found');
      };
    });

    it('should always return modules from registry', async () => {
      const result = await resolverManager.resolve('@test/utils');
      
      expect(result.content.contentType).toBe('module');
      expect(result.resolverName).toBe('REGISTRY');
    });
  });

  describe('Built-in Resolvers', () => {
    beforeEach(() => {
      resolverManager.registerResolver(new TimeResolver());
      resolverManager.registerResolver(new DebugResolver());
      resolverManager.registerResolver(new InputResolver('{"test": "data"}'));
    });

    it('TIME resolver returns text by default', async () => {
      const result = await resolverManager.resolve('@TIME');
      
      expect(result.content.contentType).toBe('text');
      expect(typeof result.content.content).toBe('string');
    });

    it('DEBUG resolver returns data', async () => {
      const result = await resolverManager.resolve('@DEBUG');
      
      expect(result.content.contentType).toBe('data');
    });

    it('INPUT resolver returns appropriate type based on content', async () => {
      const result = await resolverManager.resolve('@INPUT');
      
      expect(result.content.contentType).toBe('data');
      expect(result.content.content).toContain('"test"');
    });
  });
});