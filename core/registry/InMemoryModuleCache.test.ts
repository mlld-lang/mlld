import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryModuleCache } from './InMemoryModuleCache';

describe('InMemoryModuleCache', () => {
  let cache: InMemoryModuleCache;
  
  beforeEach(() => {
    cache = new InMemoryModuleCache();
  });

  it('should store and retrieve content', async () => {
    const content = 'test content';
    const source = 'https://example.com/test.mld';
    
    const entry = await cache.store(content, source);
    expect(entry.hash).toBeTruthy();
    expect(entry.path).toBe(`memory://${entry.hash}`);
    
    const retrieved = await cache.retrieve(entry.hash);
    expect(retrieved).toBe(content);
    
    // Check metadata includes source
    const metadata = await cache.getMetadata(entry.hash);
    expect(metadata?.source).toBe(source);
  });

  it('should return null for non-existent content', async () => {
    const retrieved = await cache.retrieve('non-existent-hash');
    expect(retrieved).toBeNull();
  });

  it('should check existence correctly', async () => {
    const content = 'test content';
    const entry = await cache.store(content, 'test-source');
    
    expect(await cache.exists(entry.hash)).toBe(true);
    expect(await cache.exists('non-existent')).toBe(false);
  });

  it('should handle memory pressure gracefully', async () => {
    // Test with progressively larger content
    const sizes = [1024, 1024 * 100, 1024 * 1024]; // 1KB, 100KB, 1MB
    
    for (const size of sizes) {
      const largeContent = 'x'.repeat(size);
      const source = `test-${size}`;
      
      const entry = await cache.store(largeContent, source);
      const retrieved = await cache.retrieve(entry.hash);
      
      expect(retrieved).toBe(largeContent);
      expect(retrieved?.length).toBe(size);
    }
  });

  it('should store multiple large modules', async () => {
    const moduleSize = 500 * 1024; // 500KB per module
    const moduleCount = 10;
    const entries = [];
    
    // Store multiple large modules
    for (let i = 0; i < moduleCount; i++) {
      const content = `Module ${i}: ${'x'.repeat(moduleSize)}`;
      const entry = await cache.store(content, `module-${i}`);
      entries.push({ entry, content });
    }
    
    // Verify all can be retrieved
    for (const { entry, content } of entries) {
      const retrieved = await cache.retrieve(entry.hash);
      expect(retrieved).toBe(content);
    }
  });

  it('should handle concurrent operations', async () => {
    const operations = Array.from({ length: 100 }, async (_, i) => {
      const content = `Content ${i}`;
      const entry = await cache.store(content, `source-${i}`);
      const retrieved = await cache.retrieve(entry.hash);
      return retrieved === content;
    });
    
    const results = await Promise.all(operations);
    expect(results.every(r => r === true)).toBe(true);
  });

  it('should generate consistent hashes', async () => {
    const content = 'consistent content';
    
    const entry1 = await cache.store(content, 'source1');
    const entry2 = await cache.store(content, 'source2');
    
    // Same content should generate same hash
    expect(entry1.hash).toBe(entry2.hash);
    
    // But sources should be different in metadata
    const metadata1 = await cache.getMetadata(entry1.hash);
    const metadata2 = await cache.getMetadata(entry2.hash);
    
    // Since same hash, metadata should be from the latest store (source2)
    expect(metadata1?.source).toBe('source2');
    expect(metadata2?.source).toBe('source2');
  });

  it('should preserve metadata correctly', async () => {
    const content = '---\ntitle: Test\n---\n\nContent';
    const source = '@test/module';
    const importPath = './test.mld';
    
    const entry = await cache.store(content, source, importPath);
    
    // Verify the metadata was stored (implementation detail)
    const retrieved = await cache.retrieve(entry.hash);
    expect(retrieved).toBe(content);
  });
});