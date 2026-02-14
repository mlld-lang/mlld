import * as fs from 'fs/promises';
import * as path from 'path';
import type { IFileSystemService } from './IFileSystemService';

/**
 * Node.js file system implementation for the interpreter
 */
export class NodeFileSystem implements IFileSystemService {
  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }
  
  async writeFile(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(filePath, content, 'utf-8');
  }
  
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async access(filePath: string): Promise<void> {
    await fs.access(filePath);
  }
  
  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(dirPath, options);
  }
  
  async readdir(dirPath: string): Promise<string[]> {
    return await fs.readdir(dirPath);
  }

  async unlink(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  async rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await fs.rm(filePath, options);
  }
  
  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  
  async stat(filePath: string): Promise<{ isDirectory(): boolean; isFile(): boolean; size?: number }> {
    const stats = await fs.stat(filePath);
    return {
      isDirectory: () => stats.isDirectory(),
      isFile: () => stats.isFile(),
      size: stats.size
    };
  }
}
