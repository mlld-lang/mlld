import { createHash } from 'crypto';
import { MlldError } from '@core/errors';
import type { ModuleCache, CacheEntry, ModuleCacheMetadata, ModuleCacheStoreOptions } from './ModuleCache';
import { moduleNeedsToSerializable } from './utils/ModuleNeeds';

/**
 * In-memory implementation of ModuleCache for ephemeral/CI environments
 * Stores modules in memory only - no filesystem persistence
 */
export class InMemoryModuleCache implements ModuleCache {
  private cache = new Map<string, {
    content: string;
    metadata: ModuleCacheMetadata;
    timestamp: number;
  }>();
  
  private index = new Map<string, string>(); // importPath -> hash mapping

  /**
   * Store module content in memory cache
   */
  async store(
    content: string, 
    source: string, 
    importPath?: string,
    options?: ModuleCacheStoreOptions
  ): Promise<CacheEntry> {
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    const timestamp = Date.now();
    
    const metadata: ModuleCacheMetadata = {
      hash,
      integrity: `sha256-${Buffer.from(hash, 'hex').toString('base64')}`,
      source,
      cachedAt: new Date(timestamp).toISOString(),
      size: Buffer.byteLength(content, 'utf8'),
      importPath
    };

    if (options?.dependencies) {
      metadata.dependencies = { ...options.dependencies };
    }

    if (options?.moduleNeeds) {
      metadata.moduleNeeds = moduleNeedsToSerializable(options.moduleNeeds);
    }
    
    // Store in cache
    this.cache.set(hash, {
      content,
      metadata,
      timestamp
    });
    
    // Update index if importPath provided
    if (importPath) {
      this.index.set(importPath, hash);
    }
    
    return {
      path: `memory://${hash}`,
      hash,
      timestamp
    };
  }

  /**
   * Retrieve module content from memory cache
   */
  async retrieve(hash: string): Promise<string | null> {
    const entry = this.cache.get(hash);
    return entry?.content || null;
  }

  /**
   * Get metadata for a cached module
   */
  async getMetadata(hash: string): Promise<ModuleCacheMetadata | null> {
    const entry = this.cache.get(hash);
    return entry?.metadata || null;
  }

  /**
   * Check if a module exists in memory cache
   */
  async exists(hash: string): Promise<boolean> {
    return this.cache.has(hash);
  }

  /**
   * Find module by import path
   */
  async findByImportPath(importPath: string): Promise<CacheEntry | null> {
    const hash = this.index.get(importPath);
    if (!hash) return null;
    
    const entry = this.cache.get(hash);
    if (!entry) return null;
    
    return {
      path: `memory://${hash}`,
      hash,
      timestamp: entry.timestamp
    };
  }

  /**
   * List all cached modules (for debugging)
   */
  async list(): Promise<Array<{ importPath?: string; hash: string; size: number }>> {
    const results: Array<{ importPath?: string; hash: string; size: number }> = [];
    
    for (const [hash, entry] of this.cache) {
      results.push({
        importPath: entry.metadata.importPath,
        hash,
        size: entry.metadata.size
      });
    }
    
    return results;
  }

  /**
   * Clear the entire cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.index.clear();
  }

  /**
   * Remove a specific module from cache
   */
  async remove(hash: string): Promise<boolean> {
    const entry = this.cache.get(hash);
    if (!entry) return false;
    
    // Remove from index if it has an import path
    if (entry.metadata.importPath) {
      this.index.delete(entry.metadata.importPath);
    }
    
    // Remove from cache
    this.cache.delete(hash);
    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): { 
    moduleCount: number; 
    totalSize: number; 
    oldestTimestamp: number | null;
  } {
    let totalSize = 0;
    let oldestTimestamp: number | null = null;
    
    for (const entry of this.cache.values()) {
      totalSize += entry.metadata.size;
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }
    
    return {
      moduleCount: this.cache.size,
      totalSize,
      oldestTimestamp
    };
  }
}