import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HashUtils, ModuleContent } from './utils/HashUtils';
import { MlldError } from '@core/errors';

/**
 * Cache entry metadata
 */
export interface CacheEntry {
  path: string;          // Full file path in cache
  hash: string;          // Full SHA-256 hash
  timestamp: number;     // Unix timestamp when cached
}

/**
 * Module cache metadata stored alongside content
 */
export interface ModuleCacheMetadata {
  hash: string;
  integrity: string;
  source: string;
  cachedAt: string;
  size: number;
  importPath?: string;
  dependencies?: Record<string, string>; // dependency name -> hash
}

/**
 * Content-addressed module cache implementation
 * Stores modules by their SHA-256 hash in ~/.mlld/cache/sha256/
 */
export class ModuleCache {
  private readonly cacheRoot: string;
  private readonly indexPath: string;

  constructor(cacheRoot?: string) {
    this.cacheRoot = cacheRoot || path.join(os.homedir(), '.mlld', 'cache', 'sha256');
    this.indexPath = path.join(this.cacheRoot, 'index.json');
  }

  /**
   * Store module content in cache
   * @param content - Module content to cache
   * @param source - Source URL/path of the module
   * @param importPath - Import path (e.g., @user/module)
   * @returns Cache entry with hash and storage path
   */
  async store(
    content: string, 
    source: string, 
    importPath?: string,
    dependencies?: Record<string, string>
  ): Promise<CacheEntry> {
    const moduleContent = HashUtils.createModuleContent(content, source);
    const { prefix, rest } = HashUtils.getCachePathComponents(moduleContent.hash);
    
    // Create directory structure: ~/.mlld/cache/sha256/ab/cdef123...
    const hashDir = path.join(this.cacheRoot, prefix, rest);
    await fs.promises.mkdir(hashDir, { recursive: true });
    
    // Store content
    const contentPath = path.join(hashDir, 'content.mld');
    await fs.promises.writeFile(contentPath, content, 'utf8');
    
    // Store metadata
    const metadata: ModuleCacheMetadata = {
      hash: moduleContent.hash,
      integrity: HashUtils.integrity(content),
      source,
      cachedAt: moduleContent.metadata!.timestamp.toISOString(),
      size: moduleContent.metadata!.size,
      importPath,
      dependencies
    };
    
    const metadataPath = path.join(hashDir, 'metadata.json');
    await fs.promises.writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf8'
    );
    
    // Update index if importPath provided
    if (importPath) {
      await this.updateIndex(importPath, moduleContent.hash);
    }
    
    return {
      path: contentPath,
      hash: moduleContent.hash,
      timestamp: moduleContent.metadata!.timestamp.getTime()
    };
  }

  /**
   * Retrieve module content by hash
   * @param hash - Full or short SHA-256 hash
   * @returns Module content and metadata, or null if not found
   */
  async get(hash: string): Promise<ModuleContent | null> {
    const fullHash = await this.resolveHash(hash);
    if (!fullHash) {
      return null;
    }
    
    const { prefix, rest } = HashUtils.getCachePathComponents(fullHash);
    const hashDir = path.join(this.cacheRoot, prefix, rest);
    const contentPath = path.join(hashDir, 'content.mld');
    const metadataPath = path.join(hashDir, 'metadata.json');
    
    try {
      const [content, metadataStr] = await Promise.all([
        fs.promises.readFile(contentPath, 'utf8'),
        fs.promises.readFile(metadataPath, 'utf8')
      ]);
      
      const metadata: ModuleCacheMetadata = JSON.parse(metadataStr);
      
      // Verify content integrity
      if (!HashUtils.verify(content, fullHash)) {
        throw new MlldError(
          `Cache corruption detected: Content hash mismatch for ${fullHash}`,
          { hash: fullHash, path: contentPath }
        );
      }
      
      if (!HashUtils.verifyIntegrity(content, metadata.integrity)) {
        throw new MlldError(
          `Cache corruption detected: Integrity check failed for ${fullHash}`,
          { hash: fullHash, integrity: metadata.integrity }
        );
      }
      
      return {
        content,
        hash: fullHash,
        metadata: {
          source: metadata.source,
          timestamp: new Date(metadata.cachedAt),
          size: metadata.size
        }
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get module metadata without loading content
   * @param hash - Full or short SHA-256 hash
   * @returns Module metadata or null if not found
   */
  async getMetadata(hash: string): Promise<ModuleCacheMetadata | null> {
    const fullHash = await this.resolveHash(hash);
    if (!fullHash) {
      return null;
    }
    
    const { prefix, rest } = HashUtils.getCachePathComponents(fullHash);
    const metadataPath = path.join(this.cacheRoot, prefix, rest, 'metadata.json');
    
    try {
      const metadataStr = await fs.promises.readFile(metadataPath, 'utf8');
      return JSON.parse(metadataStr);
    } catch {
      return null;
    }
  }

  /**
   * Check if module exists in cache
   * @param hash - Full or short SHA-256 hash
   * @returns true if module is cached
   */
  async has(hash: string): Promise<boolean> {
    const fullHash = await this.resolveHash(hash);
    if (!fullHash) {
      return false;
    }
    
    const { prefix, rest } = HashUtils.getCachePathComponents(fullHash);
    const contentPath = path.join(this.cacheRoot, prefix, rest, 'content.mld');
    
    try {
      await fs.promises.access(contentPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove module from cache
   * @param hash - Full or short SHA-256 hash
   */
  async remove(hash: string): Promise<void> {
    const fullHash = await this.resolveHash(hash);
    if (!fullHash) {
      return;
    }
    
    const { prefix, rest } = HashUtils.getCachePathComponents(fullHash);
    const hashDir = path.join(this.cacheRoot, prefix, rest);
    
    try {
      await fs.promises.rm(hashDir, { recursive: true, force: true });
      
      // Clean up empty prefix directory
      const prefixDir = path.join(this.cacheRoot, prefix);
      const entries = await fs.promises.readdir(prefixDir);
      if (entries.length === 0) {
        await fs.promises.rmdir(prefixDir);
      }
    } catch {
      // Ignore errors - module might not exist
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    try {
      await fs.promises.rm(this.cacheRoot, { recursive: true, force: true });
      await fs.promises.mkdir(this.cacheRoot, { recursive: true });
    } catch (error) {
      throw new MlldError(`Failed to clear cache: ${error.message}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalSize: number;
    moduleCount: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    let totalSize = 0;
    let moduleCount = 0;
    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;
    
    const scanDir = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.name === 'metadata.json') {
            moduleCount++;
            
            try {
              const content = await fs.promises.readFile(fullPath, 'utf8');
              const metadata: ModuleCacheMetadata = JSON.parse(content);
              const cachedDate = new Date(metadata.cachedAt);
              
              totalSize += metadata.size;
              
              if (!oldestEntry || cachedDate < oldestEntry) {
                oldestEntry = cachedDate;
              }
              if (!newestEntry || cachedDate > newestEntry) {
                newestEntry = cachedDate;
              }
            } catch {
              // Ignore invalid metadata
            }
          }
        }
      } catch {
        // Ignore errors
      }
    };
    
    await scanDir(this.cacheRoot);
    
    return { totalSize, moduleCount, oldestEntry, newestEntry };
  }

  /**
   * List all cached modules
   * @returns Array of cache entries
   */
  async list(): Promise<CacheEntry[]> {
    const entries: CacheEntry[] = [];
    
    const scanDir = async (dir: string): Promise<void> => {
      try {
        const items = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          if (item.isDirectory()) {
            const fullPath = path.join(dir, item.name);
            const metadataPath = path.join(fullPath, 'metadata.json');
            
            try {
              const metadataStr = await fs.promises.readFile(metadataPath, 'utf8');
              const metadata: ModuleCacheMetadata = JSON.parse(metadataStr);
              
              entries.push({
                path: path.join(fullPath, 'content.mld'),
                hash: metadata.hash,
                timestamp: new Date(metadata.cachedAt).getTime()
              });
            } catch {
              // Skip if no valid metadata
              await scanDir(fullPath);
            }
          }
        }
      } catch {
        // Ignore errors
      }
    };
    
    await scanDir(this.cacheRoot);
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Resolve short hash to full hash
   * @param shortHash - Short or full hash
   * @returns Full hash or null if not found/ambiguous
   */
  private async resolveHash(shortHash: string): Promise<string | null> {
    // If already full hash, return as is
    if (shortHash.length === 64 && /^[a-f0-9]{64}$/.test(shortHash)) {
      return shortHash;
    }
    
    // Get all available hashes
    const entries = await this.list();
    const availableHashes = entries.map(e => e.hash);
    
    try {
      return HashUtils.expandHash(shortHash, availableHashes);
    } catch (error) {
      // Ambiguous hash
      throw new MlldError(error.message, { shortHash, matches: availableHashes.filter(h => h.startsWith(shortHash)) });
    }
  }

  /**
   * Update index mapping import paths to hashes
   * @param importPath - Import path (e.g., @user/module)
   * @param hash - Full SHA-256 hash
   */
  private async updateIndex(importPath: string, hash: string): Promise<void> {
    let index: Record<string, string> = {};
    
    try {
      const content = await fs.promises.readFile(this.indexPath, 'utf8');
      index = JSON.parse(content);
    } catch {
      // Index doesn't exist yet
    }
    
    index[importPath] = hash;
    
    await fs.promises.writeFile(
      this.indexPath,
      JSON.stringify(index, null, 2),
      'utf8'
    );
  }

  /**
   * Get hash for import path from index
   * @param importPath - Import path (e.g., @user/module)
   * @returns Hash or null if not indexed
   */
  async getHashByImportPath(importPath: string): Promise<string | null> {
    try {
      const content = await fs.promises.readFile(this.indexPath, 'utf8');
      const index: Record<string, string> = JSON.parse(content);
      return index[importPath] || null;
    } catch {
      return null;
    }
  }
}