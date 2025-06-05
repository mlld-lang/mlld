import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CacheMetadata {
  importPath: string;
  gistRevision?: string;
  integrity: string;
  cachedAt: string;
  size: number;
}

export class Cache {
  constructor(private readonly basePath: string) {}

  async get(resolvedUrl: string, revision?: string): Promise<string | null> {
    const cachePath = this.getCachePath(resolvedUrl, revision);
    const contentPath = path.join(cachePath, 'content.mld');
    
    try {
      return await fs.promises.readFile(contentPath, 'utf8');
    } catch {
      return null;
    }
  }

  async store(
    resolvedUrl: string, 
    content: string, 
    metadata: Omit<CacheMetadata, 'cachedAt' | 'size'>
  ): Promise<void> {
    const cachePath = this.getCachePath(resolvedUrl, metadata.gistRevision);
    await fs.promises.mkdir(cachePath, { recursive: true });
    
    // Store content
    const contentPath = path.join(cachePath, 'content.mld');
    await fs.promises.writeFile(contentPath, content);
    
    // Store metadata
    const fullMetadata: CacheMetadata = {
      ...metadata,
      cachedAt: new Date().toISOString(),
      size: Buffer.byteLength(content, 'utf8')
    };
    
    const metadataPath = path.join(cachePath, 'metadata.json');
    await fs.promises.writeFile(
      metadataPath,
      JSON.stringify(fullMetadata, null, 2)
    );
  }

  async getMetadata(resolvedUrl: string, revision?: string): Promise<CacheMetadata | null> {
    const cachePath = this.getCachePath(resolvedUrl, revision);
    const metadataPath = path.join(cachePath, 'metadata.json');
    
    try {
      const content = await fs.promises.readFile(metadataPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async invalidate(resolvedUrl: string, revision?: string): Promise<void> {
    const cachePath = this.getCachePath(resolvedUrl, revision);
    
    try {
      await fs.promises.rm(cachePath, { recursive: true, force: true });
    } catch {
      // Ignore errors - cache entry might not exist
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.promises.rm(this.basePath, { recursive: true, force: true });
      await fs.promises.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      console.warn(`Failed to clear cache: ${error.message}`);
    }
  }

  async size(): Promise<number> {
    let totalSize = 0;
    
    async function calculateSize(dirPath: string): Promise<void> {
      try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await calculateSize(fullPath);
          } else {
            const stats = await fs.promises.stat(fullPath);
            totalSize += stats.size;
          }
        }
      } catch {
        // Ignore errors
      }
    }
    
    await calculateSize(this.basePath);
    return totalSize;
  }

  private getCachePath(resolvedUrl: string, revision?: string): string {
    // Handle different URL types
    if (resolvedUrl.startsWith('https://gist.githubusercontent.com/')) {
      // Parse gist URL: https://gist.githubusercontent.com/username/gist_id/raw/revision/filename
      const parts = resolvedUrl.split('/');
      const username = parts[3];
      const gistId = parts[4];
      const urlRevision = parts[6]; // Might be in URL
      
      // Use provided revision or extract from URL
      const finalRevision = revision || urlRevision || 'latest';
      
      return path.join(this.basePath, 'gist', username, gistId, finalRevision);
    } else if (resolvedUrl.startsWith('mlld://registry/')) {
      // Registry imports get their own cache structure
      const moduleName = resolvedUrl.replace('mlld://registry/', '');
      const hash = crypto.createHash('sha256').update(moduleName).digest('hex').slice(0, 8);
      return path.join(this.basePath, 'registry', moduleName.replace('/', '-'), hash);
    } else {
      // Fallback: hash-based cache path
      const hash = crypto.createHash('sha256').update(resolvedUrl).digest('hex');
      return path.join(this.basePath, 'other', hash.slice(0, 2), hash);
    }
  }

  // Get cache statistics for reporting
  async getStats(): Promise<{
    totalSize: number;
    fileCount: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    let fileCount = 0;
    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;
    
    async function scanDir(dirPath: string): Promise<void> {
      try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.name === 'metadata.json') {
            fileCount++;
            
            try {
              const content = await fs.promises.readFile(fullPath, 'utf8');
              const metadata: CacheMetadata = JSON.parse(content);
              const cachedDate = new Date(metadata.cachedAt);
              
              if (!oldestEntry || cachedDate < oldestEntry) {
                oldestEntry = cachedDate;
              }
              if (!newestEntry || cachedDate > newestEntry) {
                newestEntry = cachedDate;
              }
            } catch {
              // Ignore invalid metadata files
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }
    
    await scanDir(this.basePath);
    const totalSize = await this.size();
    
    return { totalSize, fileCount, oldestEntry, newestEntry };
  }
}