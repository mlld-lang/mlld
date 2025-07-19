import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

interface CacheEntry {
  content: string;
  contentHash: string;
  url: string;
  cachedAt: string;
  size: number;
}

export interface ImmutableCacheOptions {
  inMemory?: boolean;
}

export class ImmutableCache {
  private cacheDir?: string;
  private inMemory: boolean;
  private memoryCache: Map<string, CacheEntry>;
  
  constructor(projectPath: string, options?: ImmutableCacheOptions) {
    this.inMemory = options?.inMemory || false;
    this.memoryCache = new Map();
    
    if (this.inMemory) {
      // In-memory mode - no filesystem operations
      return;
    }
    
    // In serverless/read-only environments, use /tmp
    // Detect by checking if we're in /var/task (Vercel) or if LAMBDA_TASK_ROOT is set (AWS Lambda)
    const isServerless = projectPath.startsWith('/var/task') || 
                        process.env.LAMBDA_TASK_ROOT || 
                        process.env.VERCEL || 
                        process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    if (isServerless) {
      // Use /tmp which is writable in serverless environments
      this.cacheDir = path.join('/tmp', '.mlld', 'cache', 'imports');
    } else {
      // Store cache in .mlld/cache directory
      this.cacheDir = path.join(projectPath, '.mlld', 'cache', 'imports');
    }
  }

  /**
   * Get cached content by URL and hash
   */
  async get(url: string, expectedHash?: string): Promise<string | null> {
    // In test mode, always return cache miss
    if (process.env.MLLD_TEST === '1') {
      return null;
    }
    
    const urlHash = this.hashUrl(url);
    
    // Handle in-memory mode
    if (this.inMemory) {
      const entry = this.memoryCache.get(urlHash);
      if (!entry) return null;
      
      // If hash provided, verify it matches
      if (expectedHash && entry.contentHash !== expectedHash) {
        return null;
      }
      
      return entry.content;
    }
    
    // Filesystem mode
    const cachePath = path.join(this.cacheDir!, urlHash);
    
    try {
      // Read metadata
      const metaPath = `${cachePath}.meta.json`;
      const metaContent = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(metaContent);
      
      // If hash provided, verify it matches
      if (expectedHash && meta.contentHash !== expectedHash) {
        return null;
      }
      
      // Read cached content
      const content = await fs.readFile(cachePath, 'utf8');
      
      // Verify integrity
      const actualHash = createHash('sha256').update(content, 'utf8').digest('hex');
      if (actualHash !== meta.contentHash) {
        // Cache corrupted, remove it
        await this.remove(url);
        return null;
      }
      
      return content;
    } catch (error) {
      // Cache miss or error
      return null;
    }
  }

  /**
   * Store content in cache
   */
  async set(url: string, content: string): Promise<string> {
    // In test mode, skip caching
    if (process.env.MLLD_TEST === '1') {
      return createHash('sha256').update(content, 'utf8').digest('hex');
    }
    
    const urlHash = this.hashUrl(url);
    const contentHash = createHash('sha256').update(content, 'utf8').digest('hex');
    
    // Handle in-memory mode
    if (this.inMemory) {
      const entry: CacheEntry = {
        url,
        content,
        contentHash,
        cachedAt: new Date().toISOString(),
        size: content.length
      };
      this.memoryCache.set(urlHash, entry);
      return contentHash;
    }
    
    // Filesystem mode
    // Ensure cache directory exists
    await fs.mkdir(this.cacheDir!, { recursive: true });
    
    const cachePath = path.join(this.cacheDir!, urlHash);
    
    // Write content
    await fs.writeFile(cachePath, content, 'utf8');
    
    // Write metadata
    const meta = {
      url,
      contentHash,
      cachedAt: new Date().toISOString(),
      size: content.length
    };
    await fs.writeFile(`${cachePath}.meta.json`, JSON.stringify(meta, null, 2));
    
    return contentHash;
  }

  /**
   * Remove cached entry
   */
  async remove(url: string): Promise<void> {
    const urlHash = this.hashUrl(url);
    
    // Handle in-memory mode
    if (this.inMemory) {
      this.memoryCache.delete(urlHash);
      return;
    }
    
    // Filesystem mode
    const cachePath = path.join(this.cacheDir!, urlHash);
    
    try {
      await fs.unlink(cachePath);
      await fs.unlink(`${cachePath}.meta.json`);
    } catch {
      // Ignore if doesn't exist
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    // Handle in-memory mode
    if (this.inMemory) {
      this.memoryCache.clear();
      return;
    }
    
    // Filesystem mode
    try {
      await fs.rm(this.cacheDir!, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    entries: number;
    totalSize: number;
    urls: string[];
  }> {
    // Handle in-memory mode
    if (this.inMemory) {
      let totalSize = 0;
      const urls: string[] = [];
      
      for (const entry of this.memoryCache.values()) {
        totalSize += entry.size;
        urls.push(entry.url);
      }
      
      return {
        entries: this.memoryCache.size,
        totalSize,
        urls
      };
    }
    
    // Filesystem mode
    try {
      const files = await fs.readdir(this.cacheDir!);
      const metaFiles = files.filter(f => f.endsWith('.meta.json'));
      
      let totalSize = 0;
      const urls: string[] = [];
      
      for (const metaFile of metaFiles) {
        const metaPath = path.join(this.cacheDir!, metaFile);
        const metaContent = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaContent);
        
        totalSize += meta.size || 0;
        urls.push(meta.url);
      }
      
      return {
        entries: metaFiles.length,
        totalSize,
        urls
      };
    } catch {
      return {
        entries: 0,
        totalSize: 0,
        urls: []
      };
    }
  }

  private hashUrl(url: string): string {
    return createHash('sha256').update(url, 'utf8').digest('hex');
  }
}