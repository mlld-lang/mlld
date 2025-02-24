import * as fs from 'fs-extra';
import { watch } from 'fs/promises';
import type { IFileSystem } from './IFileSystem.js';
import type { Stats } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Adapter to use Node's fs-extra as our IFileSystem implementation
 */
export class NodeFileSystem implements IFileSystem {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf-8');
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
    await fs.mkdir(path, { recursive: true });
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
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
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    return watch(path, options) as AsyncIterableIterator<{ filename: string; eventType: string }>;
  }

  async executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
    return execAsync(command, options);
  }
} 