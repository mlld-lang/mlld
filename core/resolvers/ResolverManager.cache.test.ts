import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResolverManager } from './ResolverManager';
import { ModuleCache, LockFile } from '@core/registry';
import { Resolver, ResolverContent } from './types';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Mock resolver that returns predictable content
class TestResolver implements Resolver {
  name = 'test';
  description = 'Test resolver for cache testing';
  type = 'input' as const;
  
  capabilities = {
    io: { read: true, write: false, list: false },
    needs: { network: false, cache: true, auth: false },
    contexts: { import: true, path: false, output: false },
    resourceType: 'module' as const,
    priority: 10,
    cache: { 
      strategy: 'persistent' as const,
      ttl: { duration: 300 }
    }
  };
  
  private callCount = 0;
  
  canResolve(ref: string): boolean {
    return ref.startsWith('@test/');
  }
  
  async resolve(ref: string): Promise<ResolverContent> {
    this.callCount++;
    const currentCount = this.callCount;
    // Return content that includes the call count to verify caching
    return {
      content: `Module content for ${ref} (call #${currentCount})`,
      mx: {
        source: `test://${ref}`,
        timestamp: new Date(),
        size: 100
      }
    };
  }
  
  getCallCount(): number {
    return this.callCount;
  }
}

describe('ResolverManager with Cache Integration', () => {
  let manager: ResolverManager;
  let moduleCache: ModuleCache;
  let lockFile: LockFile;
  let testResolver: TestResolver;
  let tempDir: string;
  
  beforeEach(async () => {
    // Create temp directory for cache and lock file
    tempDir = path.join(os.tmpdir(), `mlld-test-${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });
    
    // Initialize cache and lock file
    moduleCache = new ModuleCache(path.join(tempDir, 'cache'));
    lockFile = new LockFile(path.join(tempDir, 'mlld.lock.json'));
    
    // Create manager with cache
    manager = new ResolverManager(undefined, moduleCache, lockFile);
    
    // Register test resolver
    testResolver = new TestResolver();
    manager.registerResolver(testResolver);
    
    // Configure prefix
    manager.configurePrefixes([
      {
        prefix: '@test/',
        resolver: 'test'
      }
    ]);
  });
  
  afterEach(async () => {
    // Clean up temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });
  
  describe('cache behavior', () => {
    it('should cache resolved modules', async () => {
      // First resolution - should call resolver
      const result1 = await manager.resolve('@test/module1');
      expect(result1.content.content).toContain('call #1');
      expect(result1.resolverName).toBe('test');
      expect(testResolver.getCallCount()).toBe(1);
      
      // Verify hash was added to mx
      expect(result1.content.mx?.hash).toBeDefined();
      
      // Verify lock file was updated
      const lockEntry = lockFile.getModule('@test/module1');
      expect(lockEntry).toBeDefined();
      expect(lockEntry?.integrity).toMatch(/^sha256:/);
    });
    
    it('should use cache for subsequent resolutions', async () => {
      // First resolution
      const result1 = await manager.resolve('@test/module1');
      const hash1 = result1.content.mx?.hash;
      
      // Second resolution - should use cache
      const result2 = await manager.resolve('@test/module1');
      
      // Content should be the same (from cache)
      expect(result2.content.content).toBe(result1.content.content);
      expect(result2.content.content).toContain('call #1'); // Still first call
      expect(result2.resolverName).toBe('cache'); // Resolved from cache
      expect(result2.content.mx?.hash).toBe(hash1);
      
      // Resolver should not have been called again
      expect(testResolver.getCallCount()).toBe(1);
    });
    
    it('should handle cache miss gracefully', async () => {
      // Manually add a lock entry with non-existent hash
      await lockFile.addModule('@test/module2', {
        version: '1.0.0',
        resolved: 'sha256:nonexistenthash123',
        source: 'test://@test/module2',
        integrity: 'sha256:nonexistenthash123',
        fetchedAt: new Date().toISOString()
      });
      
      // Resolution should fall back to resolver
      const result = await manager.resolve('@test/module2');
      expect(result.content.content).toContain('call #1');
      expect(result.resolverName).toBe('test');
      
      // Lock file should be updated with correct hash
      const lockEntry = lockFile.getModule('@test/module2');
      expect(lockEntry?.integrity).not.toBe('sha256:nonexistenthash123');
    });
    
    it('should respect offline mode', async () => {
      // Enable offline mode
      manager.setOfflineMode(true);
      
      // First resolution should fail in offline mode (not cached)
      await expect(manager.resolve('@test/module3')).rejects.toThrow('not available in offline mode');
      
      // Disable offline mode and cache the module
      manager.setOfflineMode(false);
      await manager.resolve('@test/module3');
      
      // Re-enable offline mode
      manager.setOfflineMode(true);
      
      // Now it should work from cache
      const result = await manager.resolve('@test/module3');
      expect(result.resolverName).toBe('cache');
    });
    
    it('should handle different modules independently', async () => {
      // Resolve multiple modules
      const result1 = await manager.resolve('@test/module1');
      const result2 = await manager.resolve('@test/module2');
      
      expect(result1.content.content).toContain('@test/module1');
      expect(result2.content.content).toContain('@test/module2');
      
      // Each should have been called once
      expect(testResolver.getCallCount()).toBe(2);
      
      // Resolve again - should use cache
      const cached1 = await manager.resolve('@test/module1');
      const cached2 = await manager.resolve('@test/module2');
      
      expect(cached1.resolverName).toBe('cache');
      expect(cached2.resolverName).toBe('cache');
      expect(testResolver.getCallCount()).toBe(2); // No new calls
    });
  });
  
  describe('cache invalidation', () => {
    it('should re-resolve when lock entry is removed', async () => {
      // First resolution to cache
      const result1 = await manager.resolve('@test/module1');
      expect(result1.resolverName).toBe('test');
      expect(testResolver.getCallCount()).toBe(1);
      
      // Second resolution should use cache
      const result2 = await manager.resolve('@test/module1');
      expect(result2.resolverName).toBe('cache');
      expect(testResolver.getCallCount()).toBe(1); // No new call
      
      // Remove lock entry to invalidate cache
      await lockFile.removeModule('@test/module1');
      
      // Third resolution should re-resolve since no lock entry
      const result3 = await manager.resolve('@test/module1');
      expect(result3.resolverName).toBe('test');
      expect(testResolver.getCallCount()).toBe(2); // New call
    });
  });
  
  describe('performance', () => {
    it('should be faster when using cache', async () => {
      // Add artificial delay to resolver
      class SlowTestResolver implements Resolver {
        name = 'slow-test';
        description = 'Slow test resolver';
        type = 'input' as const;
        private callCount = 0;
        
        capabilities = {
          io: { read: true, write: false, list: false },
          needs: { network: false, cache: true, auth: false },
          contexts: { import: true, path: false, output: false },
          resourceType: 'module' as const,
          priority: 50,
          cache: { 
            strategy: 'memory' as const,
            ttl: { duration: 300 }
          }
        };
        
        canResolve(ref: string): boolean {
          return ref.startsWith('@slow/');
        }
        
        async resolve(ref: string): Promise<ResolverContent> {
          await new Promise(resolve => setTimeout(resolve, 50));
          this.callCount++;
          return {
            content: `Slow content for ${ref}`,
            mx: {
              source: `slow://${ref}`,
              timestamp: new Date(),
              size: 100
            }
          };
        }
      }
      
      const slowResolver = new SlowTestResolver();
      
      manager.registerResolver(slowResolver);
      manager.configurePrefixes([
        { prefix: '@slow/', resolver: slowResolver.name }
      ]);
      
      // First resolution - slow
      const start1 = Date.now();
      const result1 = await manager.resolve('@slow/module');
      const time1 = Date.now() - start1;
      
      expect(time1).toBeGreaterThan(40); // Should take at least 50ms
      
      // Second resolution - fast (from cache)
      const start2 = Date.now();
      const result2 = await manager.resolve('@slow/module');
      const time2 = Date.now() - start2;
      
      expect(time2).toBeLessThan(time1 / 2); // Should be at least 2x faster than uncached
      expect(result2.resolverName).toBe('cache');
    });
  });
});