import type { IFileSystemService } from '@services/fs/IFileSystemService';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Adapter that wraps IFileSystemService to provide Node.js fs-compatible API
 * This is used for components that require full fs API (like Cache, ModuleCache)
 */
export class FileSystemAdapter {
  constructor(private fileSystem: IFileSystemService) {}

  // Create promises namespace for fs.promises compatibility
  get promises() {
    return {
      readFile: async (filePath: string, encoding?: string): Promise<string | Buffer> => {
        const content = await this.fileSystem.readFile(filePath);
        if (encoding === 'utf8' || encoding === 'utf-8') {
          return content;
        }
        return Buffer.from(content, 'utf8');
      },

      writeFile: async (filePath: string, content: string | Buffer, _encoding?: string): Promise<void> => {
        const data = Buffer.isBuffer(content) ? content.toString('utf8') : content;
        await this.fileSystem.writeFile(filePath, data);
      },

      mkdir: async (dirPath: string, options?: { recursive?: boolean }): Promise<string | undefined> => {
        await this.fileSystem.mkdir(dirPath, options);
        return undefined;
      },

      readdir: async (dirPath: string, options?: { withFileTypes?: boolean }): Promise<string[] | fs.Dirent[]> => {
        const entries = await this.fileSystem.readdir(dirPath);
        
        if (options?.withFileTypes) {
          // Create mock Dirent objects
          const dirents: fs.Dirent[] = [];
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            try {
              const stats = await this.fileSystem.stat(fullPath);
              dirents.push(createMockDirent(entry, stats.isDirectory()));
            } catch {
              // If stat fails, assume it's a file
              dirents.push(createMockDirent(entry, false));
            }
          }
          
          return dirents;
        }
        
        return entries;
      },

      stat: async (filePath: string): Promise<fs.Stats> => {
        const stats = await this.fileSystem.stat(filePath);
        return createMockStats(stats);
      },

      lstat: async (filePath: string): Promise<fs.Stats> => {
        // For testing, lstat behaves the same as stat (no symlinks)
        return this.promises.stat(filePath);
      },

      access: async (filePath: string): Promise<void> => {
        if (!await this.fileSystem.exists(filePath)) {
          const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as any;
          error.code = 'ENOENT';
          throw error;
        }
      },

      rm: async (filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> => {
        // If the fileSystem has rm method, use it
        if ('rm' in this.fileSystem && typeof (this.fileSystem as any).rm === 'function') {
          await (this.fileSystem as any).rm(filePath, options);
        } else {
          // Fallback implementation
          if (!await this.fileSystem.exists(filePath)) {
            if (!options?.force) {
              const error = new Error(`ENOENT: no such file or directory, rm '${filePath}'`) as any;
              error.code = 'ENOENT';
              throw error;
            }
            return;
          }
          
          if (options?.recursive && await this.fileSystem.isDirectory(filePath)) {
            // Recursively delete directory contents
            const entries = await this.fileSystem.readdir(filePath);
            for (const entry of entries) {
              await this.promises.rm(path.join(filePath, entry), options);
            }
          }
          
          // For MemoryFileSystem, we need to handle this specially
          // Since we can't actually delete, we'll throw an error
          throw new Error('FileSystemAdapter: rm not fully supported for this file system');
        }
      }
    };
  }
}

// Helper to create mock Dirent objects
function createMockDirent(name: string, isDirectory: boolean): fs.Dirent {
  return {
    name,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false
  } as fs.Dirent;
}

// Helper to create mock Stats objects
function createMockStats(stats: { isDirectory(): boolean; isFile(): boolean; size?: number }): fs.Stats {
  const now = new Date();
  return {
    isDirectory: () => stats.isDirectory(),
    isFile: () => stats.isFile(),
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    size: stats.size || 0,
    mode: 0o644,
    uid: 1000,
    gid: 1000,
    dev: 0,
    ino: 0,
    rdev: 0,
    blksize: 4096,
    blocks: Math.ceil((stats.size || 0) / 512),
    atimeMs: now.getTime(),
    mtimeMs: now.getTime(),
    ctimeMs: now.getTime(),
    birthtimeMs: now.getTime(),
    atime: now,
    mtime: now,
    ctime: now,
    birthtime: now,
    nlink: 1
  } as fs.Stats;
}