import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export class ImmutableCache {
  private cacheDir: string;
  
  constructor(projectPath: string) {
    // Store cache in .mlld/cache directory
    this.cacheDir = path.join(projectPath, '.mlld', 'cache', 'imports');
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
    const cachePath = path.join(this.cacheDir, urlHash);
    
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
    
    // Ensure cache directory exists
    await fs.mkdir(this.cacheDir, { recursive: true });
    
    const urlHash = this.hashUrl(url);
    const cachePath = path.join(this.cacheDir, urlHash);
    const contentHash = createHash('sha256').update(content, 'utf8').digest('hex');
    
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
    const cachePath = path.join(this.cacheDir, urlHash);
    
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
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
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
    try {
      const files = await fs.readdir(this.cacheDir);
      const metaFiles = files.filter(f => f.endsWith('.meta.json'));
      
      let totalSize = 0;
      const urls: string[] = [];
      
      for (const metaFile of metaFiles) {
        const metaPath = path.join(this.cacheDir, metaFile);
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