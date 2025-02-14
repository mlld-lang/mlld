import { Volume } from 'memfs';
import * as path from 'path';
import type { Stats } from 'fs';

/**
 * In-memory filesystem for testing using memfs.
 * Provides a clean interface for file operations and ensures proper directory handling.
 */
export class MemfsTestFileSystem {
  private vol: Volume;

  constructor() {
    this.vol = new Volume();
  }

  /**
   * Initialize or reset the filesystem
   */
  initialize(): void {
    this.vol.reset();
  }

  /**
   * Clean up any resources
   */
  cleanup(): void {
    this.vol.reset();
  }

  /**
   * Write a file, creating parent directories if needed
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    // Ensure parent directory exists
    const dirPath = path.dirname(filePath);
    if (dirPath !== '.') {
      await this.ensureDir(dirPath);
    }
    this.vol.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * Read a file's contents
   */
  async readFile(filePath: string): Promise<string> {
    return this.vol.readFileSync(filePath, 'utf-8') as string;
  }

  /**
   * Check if a file exists
   */
  async exists(filePath: string): Promise<boolean> {
    return this.vol.existsSync(filePath);
  }

  /**
   * Get stats for a file or directory
   */
  async stat(filePath: string): Promise<Stats> {
    return this.vol.statSync(filePath) as Stats;
  }

  /**
   * List contents of a directory
   */
  async readDir(dirPath: string): Promise<string[]> {
    return this.vol.readdirSync(dirPath) as string[];
  }

  /**
   * Create a directory and its parents if needed
   */
  async ensureDir(dirPath: string): Promise<void> {
    if (!this.vol.existsSync(dirPath)) {
      this.vol.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Check if path is a directory
   */
  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stats = await this.stat(filePath);
      return stats.isDirectory();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if path is a file
   */
  async isFile(filePath: string): Promise<boolean> {
    try {
      const stats = await this.stat(filePath);
      return stats.isFile();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  // Helper to load a project structure from our fixture format
  async loadFixture(fixture: { files?: Record<string, string>; dirs?: string[] }): Promise<void> {
    // First create all directories
    if (fixture.dirs) {
      for (const dir of fixture.dirs) {
        await this.ensureDir(dir);
      }
    }

    // Then create all files
    if (fixture.files) {
      for (const [filePath, content] of Object.entries(fixture.files)) {
        await this.writeFile(filePath, content);
      }
    }
  }

  // Get all files in the filesystem
  async getAllFiles(dir: string = '/'): Promise<string[]> {
    const result: string[] = [];
    const entries = this.vol.readdirSync(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = this.vol.statSync(fullPath);

      if (stats.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath);
        result.push(...subFiles);
      } else {
        result.push(fullPath);
      }
    }

    return result;
  }
} 