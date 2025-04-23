import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import * as path from 'path';
import { Stats } from 'fs-extra';

/**
 * Simple in-memory file system implementation for use with the runMeld API.
 * This allows processing meld content without touching the real file system.
 */
export class MemoryFileSystem implements IFileSystem {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set();
  isTestEnvironment: boolean = true;

  constructor() {
    // Initialize with root directory
    this.dirs.add('/');
  }

  /**
   * Read a file from memory
   */
  async readFile(filePath: string): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);
    if (!this.files.has(normalizedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return this.files.get(normalizedPath) || '';
  }

  /**
   * Write a file to memory
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    // Ensure parent directory exists
    const dirPath = path.dirname(normalizedPath);
    await this.mkdir(dirPath);
    
    this.files.set(normalizedPath, content);
  }

  /**
   * Check if a file exists in memory
   */
  async exists(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    return this.files.has(normalizedPath) || this.dirs.has(normalizedPath);
  }

  /**
   * Create a directory in memory
   */
  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const normalizedPath = this.normalizePath(dirPath);
    
    if (options?.recursive) {
      // Create parent directories if needed
      const parts = normalizedPath.split('/').filter(Boolean);
      let currentPath = '/';
      
      this.dirs.add(currentPath);
      
      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        this.dirs.add(currentPath);
      }
    } else {
      // Ensure parent directory exists for non-recursive mkdir
      const parentDir = path.dirname(normalizedPath);
      if (parentDir !== normalizedPath && !this.dirs.has(parentDir)) {
        // Create parent directory recursively
        await this.mkdir(parentDir, { recursive: true });
      }
      // Add this directory
      this.dirs.add(normalizedPath);
    }
  }

  /**
   * Check if a path is a file
   */
  async isFile(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    return this.files.has(normalizedPath);
  }

  /**
   * Check if a path is a directory
   */
  async isDirectory(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    return this.dirs.has(normalizedPath);
  }

  /**
   * List directory contents
   */
  async readDir(dirPath: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(dirPath);
    if (!this.dirs.has(normalizedPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    
    const entries: string[] = [];
    const prefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
    
    // Find all files directly in this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relativePath = filePath.substring(prefix.length);
        if (!relativePath.includes('/')) {
          entries.push(relativePath);
        }
      }
    }
    
    // Find all subdirectories directly in this directory
    for (const dirPath of this.dirs) {
      if (dirPath !== normalizedPath && dirPath.startsWith(prefix)) {
        const relativePath = dirPath.substring(prefix.length);
        if (!relativePath.includes('/')) {
          entries.push(relativePath);
        }
      }
    }
    
    return entries;
  }

  /**
   * Get file stats
   */
  async stat(filePath: string): Promise<Stats> {
    const normalizedPath = this.normalizePath(filePath);
    if (this.files.has(normalizedPath)) {
      // It's a file
      const content = this.files.get(normalizedPath) || '';
      return {
        isFile: () => true,
        isDirectory: () => false,
        size: content.length,
        mtime: new Date(),
        ctime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o666,
        // Add other required Stats properties
      } as unknown as Stats;
    }
    
    if (this.dirs.has(normalizedPath)) {
      // It's a directory
      return {
        isFile: () => false,
        isDirectory: () => true,
        size: 0,
        mtime: new Date(),
        ctime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o777,
        // Add other required Stats properties
      } as unknown as Stats;
    }
    
    throw new Error(`Path not found: ${filePath}`);
  }

  /**
   * Watch a file or directory for changes
   * This is a minimal implementation that doesn't actually watch anything
   * since it's for the runMeld API which doesn't need watching
   */
  async *watch(
    path: string, 
    options?: { recursive?: boolean }
  ): AsyncIterableIterator<{ filename: string; eventType: string }> {
    // This is a no-op implementation since we don't need actual watching
    // for the runMeld API
    return;
  }

  /**
   * Execute a command
   * This is a minimal implementation that doesn't actually execute anything
   * but returns empty stdout/stderr
   */
  async executeCommand(
    command: string, 
    options?: { cwd?: string }
  ): Promise<{ stdout: string; stderr: string }> {
    // This is a simplified implementation for in-memory usage
    // Just return empty output
    return {
      stdout: '',
      stderr: ''
    };
  }

  /**
   * Rename a file or directory
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    const normalizedOldPath = this.normalizePath(oldPath);
    const normalizedNewPath = this.normalizePath(newPath);
    
    if (this.files.has(normalizedOldPath)) {
      // Rename file
      const content = this.files.get(normalizedOldPath) || '';
      this.files.set(normalizedNewPath, content);
      this.files.delete(normalizedOldPath);
    } else if (this.dirs.has(normalizedOldPath)) {
      // Rename directory
      this.dirs.add(normalizedNewPath);
      this.dirs.delete(normalizedOldPath);
      
      // Move all files in this directory
      const oldPrefix = normalizedOldPath === '/' ? '/' : normalizedOldPath + '/';
      const newPrefix = normalizedNewPath === '/' ? '/' : normalizedNewPath + '/';
      
      for (const [filePath, content] of [...this.files.entries()]) {
        if (filePath.startsWith(oldPrefix)) {
          const newFilePath = newPrefix + filePath.substring(oldPrefix.length);
          this.files.set(newFilePath, content);
          this.files.delete(filePath);
        }
      }
      
      // Move all subdirectories
      for (const dirPath of [...this.dirs]) {
        if (dirPath.startsWith(oldPrefix)) {
          const newDirPath = newPrefix + dirPath.substring(oldPrefix.length);
          this.dirs.add(newDirPath);
          this.dirs.delete(dirPath);
        }
      }
    } else {
      throw new Error(`Path not found: ${oldPath}`);
    }
  }

  /**
   * Delete a file
   */
  async unlink(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    if (!this.files.has(normalizedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    this.files.delete(normalizedPath);
  }

  /**
   * Delete a directory
   */
  async rmdir(dirPath: string): Promise<void> {
    const normalizedPath = this.normalizePath(dirPath);
    if (!this.dirs.has(normalizedPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    
    // Check if directory is empty
    const prefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
    
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        throw new Error(`Directory not empty: ${dirPath}`);
      }
    }
    
    for (const subDirPath of this.dirs) {
      if (subDirPath !== normalizedPath && subDirPath.startsWith(prefix)) {
        throw new Error(`Directory not empty: ${dirPath}`);
      }
    }
    
    this.dirs.delete(normalizedPath);
  }

  /**
   * Helper method to normalize a path
   */
  private normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  /**
   * Required by interface but no-op for in-memory FS
   */
  setFileSystem(fileSystem: IFileSystem): void {
    // No-op
  }
} 