import * as fs from 'fs-extra';
import { watch } from 'fs/promises';
import type { IFileSystem } from './IFileSystem.js';
import type { Stats } from 'fs';

/**
 * Adapter to use Node's fs-extra as our IFileSystem implementation
 */
export class NodeFileSystem implements IFileSystem {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    return fs.writeFile(path, content, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    return fs.pathExists(path);
  }

  async stat(path: string): Promise<Stats> {
    return fs.stat(path);
  }

  async readDir(path: string): Promise<string[]> {
    return fs.readdir(path);
  }

  async mkdir(path: string): Promise<void> {
    return fs.mkdir(path, { recursive: true });
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async isFile(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isFile();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    return watch(path, options);
  }
} 