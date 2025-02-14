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
    // Initialize root directory
    this.vol.mkdirSync('.', { recursive: true });
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
   * Get the absolute path for a path in the test filesystem.
   * For external use (e.g. test assertions), paths have a leading slash.
   * For internal use with memfs, paths do not have a leading slash.
   */
  getPath(filePath: string | undefined, forMemfs: boolean = false): string {
    // Handle undefined/empty paths
    if (!filePath) {
      return forMemfs ? '.' : '/';
    }

    // Normalize the path to use forward slashes and remove any '..' segments
    const normalized = path.normalize(filePath).replace(/\\/g, '/');
    
    // Remove any existing leading slashes
    const withoutLeadingSlash = normalized.replace(/^\/+/, '');

    // Handle root directory specially
    if (!withoutLeadingSlash) {
      return forMemfs ? '.' : '/';
    }

    // For memfs internal use, return without leading slash
    if (forMemfs) {
      return withoutLeadingSlash;
    }

    // For external use, ensure exactly one leading slash
    return `/${withoutLeadingSlash}`;
  }

  /**
   * Internal helper to get path formatted for memfs operations
   */
  private getMemfsPath(filePath: string): string {
    return this.getPath(filePath, true);
  }

  /**
   * Write a file, creating parent directories if needed
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const memfsPath = this.getMemfsPath(filePath);
    
    // Check if target exists and is a directory
    if (this.vol.existsSync(memfsPath)) {
      const stats = this.vol.statSync(memfsPath);
      if (stats.isDirectory()) {
        throw new Error(`EISDIR: Cannot write to directory: ${filePath}`);
      }
    }
    
    // Ensure parent directory exists
    const dirPath = path.dirname(memfsPath);
    if (dirPath !== '.') {
      await this.ensureDir(dirPath);
    }
    this.vol.writeFileSync(memfsPath, content, 'utf-8');
  }

  /**
   * Read a file's contents
   */
  async readFile(filePath: string): Promise<string> {
    const memfsPath = this.getMemfsPath(filePath);
    const stats = this.vol.statSync(memfsPath);
    if (stats.isDirectory()) {
      throw new Error(`EISDIR: Cannot read directory as file: ${filePath}`);
    }
    return this.vol.readFileSync(memfsPath, 'utf-8') as string;
  }

  /**
   * Check if a file exists
   */
  async exists(filePath: string): Promise<boolean> {
    return this.vol.existsSync(this.getMemfsPath(filePath));
  }

  /**
   * Get stats for a file or directory
   */
  async stat(filePath: string): Promise<Stats> {
    return this.vol.statSync(this.getMemfsPath(filePath)) as Stats;
  }

  /**
   * List contents of a directory
   */
  async readDir(dirPath: string): Promise<string[]> {
    return this.vol.readdirSync(this.getMemfsPath(dirPath)) as string[];
  }

  /**
   * Create a directory and its parents if needed
   */
  async ensureDir(dirPath: string): Promise<void> {
    const memfsPath = this.getMemfsPath(dirPath);
    if (!this.vol.existsSync(memfsPath)) {
      this.vol.mkdirSync(memfsPath, { recursive: true });
    }
  }

  /**
   * Create a directory
   */
  async mkdir(dirPath: string): Promise<void> {
    this.vol.mkdirSync(this.getMemfsPath(dirPath), { recursive: true });
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
    const entries = this.vol.readdirSync(this.getMemfsPath(dir));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = this.vol.statSync(this.getMemfsPath(fullPath));

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