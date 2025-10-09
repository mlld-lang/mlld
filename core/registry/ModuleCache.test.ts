import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModuleCache } from './ModuleCache';
import { HashUtils } from './utils/HashUtils';
import { normalizeModuleNeeds, moduleNeedsToSerializable } from './utils/ModuleNeeds';

describe('ModuleCache', () => {
  let cache: ModuleCache;
  let testCacheRoot: string;
  
  beforeEach(async () => {
    // Create a temporary cache directory for testing
    testCacheRoot = path.join(os.tmpdir(), 'mlld-test-cache-' + Date.now());
    cache = new ModuleCache(path.join(testCacheRoot, 'sha256'));
  });
  
  afterEach(async () => {
    // Clean up test cache
    try {
      await fs.promises.rm(testCacheRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  describe('store', () => {
    it('should store module content by hash', async () => {
      const content = 'export const hello = "world";';
      const source = 'https://example.com/module.mld';
      
      const entry = await cache.store(content, source, '@test/module');
      
      expect(entry.hash).toHaveLength(64);
      expect(entry.hash).toBe(HashUtils.hash(content));
      expect(entry.path).toContain('content.mld');
      expect(entry.timestamp).toBeGreaterThan(0);
      
      // Verify files were created
      const { prefix, rest } = HashUtils.getCachePathComponents(entry.hash);
      // Use cache's internal structure instead of hard-coding paths
      const cacheDir = (cache as any).cacheRoot;
      const contentPath = path.join(cacheDir, prefix, rest, 'content.mld');
      const metadataPath = path.join(cacheDir, prefix, rest, 'metadata.json');
      
      expect(await fs.promises.readFile(contentPath, 'utf8')).toBe(content);
      
      const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
      expect(metadata.hash).toBe(entry.hash);
      expect(metadata.source).toBe(source);
      expect(metadata.importPath).toBe('@test/module');
    });
    
    it('should store dependencies if provided', async () => {
      const content = 'import { util } from "@dep/util";\nexport const test = util();';
      const dependencies = { '@dep/util': 'abc123def456' };
      
      const entry = await cache.store(content, 'test.mld', '@test/with-deps', { dependencies });
      
      const metadata = await cache.getMetadata(entry.hash);
      expect(metadata?.dependencies).toEqual(dependencies);
    });

    it('should store module needs when provided', async () => {
      const content = 'export const needs = true;';
      const moduleNeeds = normalizeModuleNeeds({
        runtimes: ['node@18'],
        tools: ['jq'],
        packages: {
          node: ['lodash@4.17.21']
        }
      });

      const entry = await cache.store(content, 'needs.mld', '@test/needs', { moduleNeeds });

      const metadata = await cache.getMetadata(entry.hash);
      expect(metadata?.moduleNeeds).toEqual(moduleNeedsToSerializable(moduleNeeds));
    });
    
    it('should update index with import path', async () => {
      const content = 'export default "test";';
      const entry = await cache.store(content, 'test.mld', '@user/module');
      
      const hash = await cache.getHashByImportPath('@user/module');
      expect(hash).toBe(entry.hash);
    });
  });
  
  describe('get', () => {
    it('should retrieve stored module by full hash', async () => {
      const content = 'export const value = 42;';
      const source = 'https://example.com/module.mld';
      
      const entry = await cache.store(content, source);
      const retrieved = await cache.get(entry.hash);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.content).toBe(content);
      expect(retrieved!.hash).toBe(entry.hash);
      expect(retrieved!.metadata?.source).toBe(source);
    });
    
    it('should retrieve module by short hash', async () => {
      const content = 'export const test = true;';
      const entry = await cache.store(content, 'test.mld');
      
      const shortHash = entry.hash.substring(0, 8);
      const retrieved = await cache.get(shortHash);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.content).toBe(content);
    });
    
    it('should return null for non-existent hash', async () => {
      const retrieved = await cache.get('nonexistent1234567890123456789012345678901234567890123456789012');
      expect(retrieved).toBeNull();
    });
    
    it('should verify content integrity on retrieval', async () => {
      const content = 'export const secure = true;';
      const entry = await cache.store(content, 'secure.mld');
      
      // Corrupt the content file
      const { prefix, rest } = HashUtils.getCachePathComponents(entry.hash);
      const cacheDir = (cache as any).cacheRoot;
      const contentPath = path.join(cacheDir, prefix, rest, 'content.mld');
      await fs.promises.writeFile(contentPath, 'corrupted content', 'utf8');
      
      await expect(cache.get(entry.hash)).rejects.toThrow(/Cache corruption detected/);
    });
    
    it('should handle ambiguous short hash', async () => {
      // Create modules and find a common prefix
      const modules: string[] = [];
      let commonPrefix = '';
      
      // Keep creating modules until we find two with the same prefix
      for (let i = 0; i < 100; i++) {
        const content = `export const module${i} = ${i};`;
        const entry = await cache.store(content, `module${i}.mld`);
        
        // Check if any existing hash shares a prefix with this one
        for (const existingHash of modules) {
          // Find common prefix of at least 2 characters
          let prefix = '';
          for (let j = 0; j < Math.min(existingHash.length, entry.hash.length); j++) {
            if (existingHash[j] === entry.hash[j]) {
              prefix += existingHash[j];
            } else {
              break;
            }
          }
          
          if (prefix.length >= 2) {
            commonPrefix = prefix;
            break;
          }
        }
        
        modules.push(entry.hash);
        
        if (commonPrefix) {
          break;
        }
      }
      
      if (commonPrefix) {
        // We found a common prefix, test that it throws
        await expect(cache.get(commonPrefix)).rejects.toThrow(/Ambiguous short hash/);
      } else {
        // If we couldn't create an ambiguous case, test the direct HashUtils method
        const hashes = [
          'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
          'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567891'
        ];
        expect(() => HashUtils.expandHash('a1b2c3d4', hashes)).toThrow(/Ambiguous short hash/);
      }
    });
  });
  
  describe('getMetadata', () => {
    it('should retrieve metadata without loading content', async () => {
      const content = 'export const large = "...".repeat(10000);';
      const source = 'large.mld';
      
      const entry = await cache.store(content, source, '@test/large');
      const metadata = await cache.getMetadata(entry.hash);
      
      expect(metadata).not.toBeNull();
      expect(metadata!.hash).toBe(entry.hash);
      expect(metadata!.source).toBe(source);
      expect(metadata!.importPath).toBe('@test/large');
      expect(metadata!.size).toBe(Buffer.byteLength(content, 'utf8'));
    });
  });
  
  describe('has', () => {
    it('should check if module exists by hash', async () => {
      const content = 'export const exists = true;';
      const entry = await cache.store(content, 'exists.mld');
      
      expect(await cache.has(entry.hash)).toBe(true);
      expect(await cache.has('nonexistent')).toBe(false);
      
      // Test with short hash
      const shortHash = entry.hash.substring(0, 8);
      expect(await cache.has(shortHash)).toBe(true);
    });
  });
  
  describe('remove', () => {
    it('should remove module from cache', async () => {
      const content = 'export const temp = true;';
      const entry = await cache.store(content, 'temp.mld');
      
      expect(await cache.has(entry.hash)).toBe(true);
      
      await cache.remove(entry.hash);
      
      expect(await cache.has(entry.hash)).toBe(false);
      expect(await cache.get(entry.hash)).toBeNull();
    });
    
    it('should clean up empty prefix directories', async () => {
      const content = 'export const cleanup = true;';
      const entry = await cache.store(content, 'cleanup.mld');
      
      const { prefix } = HashUtils.getCachePathComponents(entry.hash);
      const cacheDir = (cache as any).cacheRoot;
      const prefixDir = path.join(cacheDir, prefix);
      
      await cache.remove(entry.hash);
      
      // Prefix directory should be removed if empty
      await expect(fs.promises.access(prefixDir)).rejects.toThrow();
    });
  });
  
  describe('clear', () => {
    it('should remove all cached modules', async () => {
      await cache.store('export const a = 1;', 'a.mld');
      await cache.store('export const b = 2;', 'b.mld');
      await cache.store('export const c = 3;', 'c.mld');
      
      const statsBefore = await cache.getStats();
      expect(statsBefore.moduleCount).toBe(3);
      
      await cache.clear();
      
      const statsAfter = await cache.getStats();
      expect(statsAfter.moduleCount).toBe(0);
    });
  });
  
  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const content1 = 'export const small = 1;';
      const content2 = 'export const large = "x".repeat(1000);';
      
      await cache.store(content1, 'small.mld');
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
      await cache.store(content2, 'large.mld');
      
      const stats = await cache.getStats();
      
      expect(stats.moduleCount).toBe(2);
      expect(stats.totalSize).toBe(
        Buffer.byteLength(content1, 'utf8') + 
        Buffer.byteLength(content2, 'utf8')
      );
      expect(stats.oldestEntry).toBeInstanceOf(Date);
      expect(stats.newestEntry).toBeInstanceOf(Date);
      expect(stats.oldestEntry!.getTime()).toBeLessThan(stats.newestEntry!.getTime());
    });
  });
  
  describe('list', () => {
    it('should list all cached modules sorted by timestamp', async () => {
      const entry1 = await cache.store('export const first = 1;', 'first.mld');
      await new Promise(resolve => setTimeout(resolve, 10));
      const entry2 = await cache.store('export const second = 2;', 'second.mld');
      await new Promise(resolve => setTimeout(resolve, 10));
      const entry3 = await cache.store('export const third = 3;', 'third.mld');
      
      const entries = await cache.list();
      
      expect(entries).toHaveLength(3);
      expect(entries[0].hash).toBe(entry3.hash); // Most recent first
      expect(entries[1].hash).toBe(entry2.hash);
      expect(entries[2].hash).toBe(entry1.hash);
    });
  });
  
  describe('getHashByImportPath', () => {
    it('should retrieve hash by import path', async () => {
      const content = 'export const indexed = true;';
      const entry = await cache.store(content, 'indexed.mld', '@user/indexed');
      
      const hash = await cache.getHashByImportPath('@user/indexed');
      expect(hash).toBe(entry.hash);
    });
    
    it('should return null for unknown import path', async () => {
      const hash = await cache.getHashByImportPath('@unknown/module');
      expect(hash).toBeNull();
    });
  });
});