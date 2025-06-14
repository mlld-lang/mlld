import { describe, it, expect, beforeEach } from 'vitest';
import { ResolverManager } from './ResolverManager';
import { LocalResolver } from './LocalResolver';
import { RegistryResolver } from './RegistryResolver';
import { Resolver, ResolverContent, RegistryConfig } from './types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

// Mock resolver for testing
class MockResolver implements Resolver {
  name = 'mock';
  description = 'Mock resolver for testing';
  type = 'input' as const;
  
  capabilities = {
    io: { read: true, write: false, list: false },
    needs: { network: false, cache: false, auth: false },
    contexts: { import: true, path: false, output: false },
    resourceType: 'module' as const,
    priority: 50,
    cache: { strategy: 'none' as const }
  };
  
  constructor(private content: string = 'mock content') {}
  
  canResolve(ref: string, config?: any): boolean {
    // Mock resolver only works with configured registries
    // It will be called with stripped references when a registry is configured
    // Otherwise it's called with the full reference
    return ref.includes('mock') || (config && config.mock);
  }
  
  async resolve(ref: string): Promise<ResolverContent> {
    return {
      content: this.content,
      metadata: {
        source: `mock://${ref}`,
        timestamp: new Date()
      }
    };
  }
}

describe('ResolverManager', () => {
  let manager: ResolverManager;
  let fileSystem: MemoryFileSystem;
  
  beforeEach(() => {
    manager = new ResolverManager();
    fileSystem = new MemoryFileSystem();
  });
  
  describe('resolver registration', () => {
    it('should register a resolver', () => {
      const resolver = new MockResolver();
      manager.registerResolver(resolver);
      
      expect(manager.getResolver('mock')).toBe(resolver);
      expect(manager.getResolverNames()).toContain('mock');
    });
    
    it('should throw error when registering duplicate resolver', () => {
      const resolver = new MockResolver();
      manager.registerResolver(resolver);
      
      expect(() => manager.registerResolver(resolver)).toThrow('already registered');
    });
    
    it('should enforce allowed resolver list', () => {
      const secureManager = new ResolverManager({
        allowCustom: false,
        pathOnlyMode: false,
        allowedResolvers: ['REGISTRY', 'LOCAL']
      });
      
      const registryResolver = new RegistryResolver();
      const mockResolver = new MockResolver();
      
      // Registry is allowed
      expect(() => secureManager.registerResolver(registryResolver)).not.toThrow();
      
      // Mock is not allowed
      expect(() => secureManager.registerResolver(mockResolver)).toThrow('not in the allowed list');
    });
  });
  
  describe('registry configuration', () => {
    it('should configure registries', () => {
      const registries: RegistryConfig[] = [
        {
          prefix: '@company/',
          resolver: 'mock',
          type: 'input',
          config: { basePath: '/company' }
        },
        {
          prefix: '@notes/',
          resolver: 'LOCAL',
          type: 'io',
          config: { basePath: '/notes' }
        }
      ];
      
      manager.registerResolver(new MockResolver());
      manager.registerResolver(new LocalResolver(fileSystem));
      
      manager.configureRegistries(registries);
      
      const configured = manager.getRegistries();
      expect(configured).toHaveLength(2);
      expect(configured[0].prefix).toBe('@company/');
      expect(configured[1].prefix).toBe('@notes/');
    });
    
    it('should sort registries by prefix length', () => {
      const registries: RegistryConfig[] = [
        { prefix: '@a/', resolver: 'mock', type: 'input' },
        { prefix: '@abc/', resolver: 'mock', type: 'input' },
        { prefix: '@ab/', resolver: 'mock', type: 'input' }
      ];
      
      manager.registerResolver(new MockResolver());
      manager.configureRegistries(registries);
      
      const configured = manager.getRegistries();
      expect(configured[0].prefix).toBe('@abc/'); // Longest first
      expect(configured[1].prefix).toBe('@ab/');
      expect(configured[2].prefix).toBe('@a/');
    });
  });
  
  describe('resolution', () => {
    beforeEach(() => {
      manager.registerResolver(new MockResolver());
      // Don't register RegistryResolver here - it interferes with specific tests
    });
    
    it('should resolve using configured prefix', async () => {
      // Configure mock resolver for @mock/ prefix  
      manager.configureRegistries([
        {
          prefix: '@mock/',
          resolver: 'mock',
          type: 'input',
          config: { mock: true }
        }
      ]);
      
      const result = await manager.resolve('@mock/file.mld');
      
      expect(result.content.content).toBe('mock content');
      expect(result.resolverName).toBe('mock');
      expect(result.matchedPrefix).toBe('@mock/');
    });
    
    
    it('should throw error for unresolvable references', async () => {
      await expect(manager.resolve('unknown/path')).rejects.toThrow('No resolver found');
    });
    
    it('should validate resolver type for operations', async () => {
      // Create a fresh manager for this test (don't use the one with MockResolver)
      const freshManager = new ResolverManager();
      
      // Create a new output-only resolver class
      class OutputOnlyResolver implements Resolver {
        name = 'output-only';
        description = 'Output only resolver';
        type = 'output' as const;
        
        capabilities = {
          io: { read: false, write: true, list: false },
          needs: { network: false, cache: false, auth: false },
          contexts: { import: false, path: false, output: true },
          resourceType: 'file' as const,
          priority: 50,
          cache: { strategy: 'none' as const }
        };
        
        canResolve(ref: string): boolean {
          // After prefix stripping, we just get the file part
          return true;
        }
        
        async resolve(ref: string): Promise<ResolverContent> {
          throw new Error('Should not be called');
        }
      }
      
      const outputResolver = new OutputOnlyResolver();
      freshManager.registerResolver(outputResolver);
      
      freshManager.configureRegistries([
        {
          prefix: '@output/',
          resolver: 'output-only',
          type: 'output'
        }
      ]);
      
      // Try to resolve with output-only resolver
      await expect(freshManager.resolve('@output/file'))
        .rejects.toThrow('does not support input operations');
    });
    
    it('should apply timeout to resolution', async () => {
      // Create a slow resolver
      class SlowResolver implements Resolver {
        name = 'slow';
        description = 'Slow resolver for testing';
        type = 'input' as const;
        
        capabilities = {
          io: { read: true, write: false, list: false },
          needs: { network: false, cache: false, auth: false },
          contexts: { import: true, path: false, output: false },
          resourceType: 'module' as const,
          priority: 50,
          cache: { strategy: 'none' as const }
        };
        
        canResolve(ref: string): boolean {
          return ref.startsWith('@slow/');
        }
        
        async resolve(ref: string): Promise<ResolverContent> {
          await new Promise(resolve => setTimeout(resolve, 100));
          return {
            content: 'slow content',
            metadata: {
              source: `slow://${ref}`,
              timestamp: new Date()
            }
          };
        }
      }
      
      const slowManager = new ResolverManager({
        allowCustom: false,
        pathOnlyMode: false,
        timeout: 50 // 50ms timeout
      });
      
      slowManager.registerResolver(new SlowResolver());
      slowManager.configureRegistries([
        { prefix: '@slow/', resolver: 'slow', type: 'input' }
      ]);
      
      await expect(slowManager.resolve('@slow/file')).rejects.toThrow('Operation timed out');
    });
  });
  
  describe('write operations', () => {
    it('should write using output resolver', async () => {
      let writtenContent: string | undefined;
      
      class WriteResolver implements Resolver {
        name = 'writer';
        description = 'Write resolver for testing';
        type = 'io' as const;
        
        capabilities = {
          io: { read: true, write: true, list: false },
          needs: { network: false, cache: false, auth: false },
          contexts: { import: false, path: false, output: true },
          resourceType: 'file' as const,
          priority: 50,
          cache: { strategy: 'none' as const }
        };
        
        canResolve(ref: string): boolean {
          return ref.startsWith('@output/');
        }
        
        async resolve(ref: string): Promise<ResolverContent> {
          return {
            content: 'existing content',
            metadata: {
              source: `writer://${ref}`,
              timestamp: new Date()
            }
          };
        }
        
        async write(ref: string, content: string): Promise<void> {
          writtenContent = content;
        }
      }
      
      manager.registerResolver(new WriteResolver());
      manager.configureRegistries([
        { prefix: '@output/', resolver: 'writer', type: 'io' }
      ]);
      
      await manager.write('@output/test.txt', 'Hello, World!');
      expect(writtenContent).toBe('Hello, World!');
    });
    
    it('should enforce output security policy', async () => {
      const secureManager = new ResolverManager({
        allowCustom: false,
        pathOnlyMode: false,
        allowOutputs: false
      });
      
      await expect(secureManager.write('@any/file', 'content')).rejects.toThrow('Output operations are not allowed');
    });
  });
  
  describe('custom resolver validation', () => {
    it('should prevent custom resolvers when not allowed', () => {
      const secureManager = new ResolverManager({
        allowCustom: false,
        pathOnlyMode: false
      });
      
      const registries: RegistryConfig[] = [
        {
          prefix: '@custom/',
          resolver: './custom-resolver.js',
          type: 'input'
        }
      ];
      
      expect(() => secureManager.configureRegistries(registries)).toThrow('Custom resolvers are not allowed');
    });
  });
});