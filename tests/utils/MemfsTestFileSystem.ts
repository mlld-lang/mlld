import { Volume } from 'memfs';
import * as path from 'path';

/**
 * In-memory filesystem for testing using memfs.
 * Provides a clean interface for file operations and ensures proper directory handling.
 */
export class MemfsTestFileSystem {
  private vol: Volume;
  private projectRoot: string;

  constructor() {
    this.vol = new Volume();
    this.projectRoot = '/project';
  }

  /**
   * Initialize or reset the filesystem
   */
  initialize(): void {
    this.vol.reset();
    this.mkdir(this.projectRoot);
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
  writeFile(filePath: string, content: string): void {
    this.ensureFileParentDirs(filePath);
    this.vol.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * Read a file's contents
   */
  readFile(filePath: string): string {
    return this.vol.readFileSync(filePath, 'utf-8') as string;
  }

  /**
   * Check if a file exists
   */
  exists(filePath: string): boolean {
    return this.vol.existsSync(filePath);
  }

  /**
   * Create a directory and its parents if needed
   */
  mkdir(dirPath: string): void {
    if (!this.exists(dirPath)) {
      this.vol.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * List contents of a directory
   */
  readdir(dirPath: string): string[] {
    return this.vol.readdirSync(dirPath) as string[];
  }

  /**
   * Remove a file or directory
   */
  remove(path: string): void {
    if (this.exists(path)) {
      this.vol.rmSync(path, { recursive: true, force: true });
    }
  }

  /**
   * Get stats for a file or directory
   */
  stat(path: string) {
    return this.vol.statSync(path);
  }

  /**
   * Check if path is a directory
   */
  isDirectory(path: string): boolean {
    try {
      return this.stat(path).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a file
   */
  isFile(path: string): boolean {
    try {
      return this.stat(path).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Ensure parent directories exist for a file path
   */
  private ensureFileParentDirs(filePath: string): void {
    const dirPath = path.dirname(filePath);
    if (!this.exists(dirPath)) {
      this.mkdir(dirPath);
    }
  }

  /**
   * Get absolute path relative to project root
   */
  getPath(relativePath: string): string {
    return path.join(this.projectRoot, relativePath);
  }
} 