/**
 * Mock implementation of MemfsTestFileSystem for testing
 */
import { Volume, createFsFromVolume } from 'memfs';
import * as path from 'path';

/**
 * In-memory file system for testing
 */
export class MemfsTestFileSystem {
  vol: Volume;

  constructor() {
    this.vol = Volume.fromJSON({
      '/project': null
    });
  }

  /**
   * Initialize the file system
   */
  initialize(): void {
    // Create basic directory structure
    this.vol.mkdirSync('/project', { recursive: true });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Reset the volume
    this.vol = new Volume();
  }

  /**
   * Get an fs-like API for this volume
   */
  getFs() {
    return createFsFromVolume(this.vol);
  }

  /**
   * Convert a path with ./ prefix to the project root
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('./')) {
      return `/project/${filePath.substring(2)}`;
    } else if (!filePath.startsWith('/')) {
      return `/project/${filePath}`;
    }
    return filePath;
  }

  /**
   * Check if a file exists
   */
  existsSync(filePath: string): boolean {
    const resolvedPath = this.resolvePath(filePath);
    try {
      return this.vol.existsSync(resolvedPath);
    } catch (error) {
      console.error(`Error checking if ${resolvedPath} exists:`, error);
      return false;
    }
  }

  /**
   * Create a directory
   */
  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    const resolvedPath = this.resolvePath(dirPath);
    try {
      this.vol.mkdirSync(resolvedPath, options);
    } catch (error) {
      // Ignore error if directory already exists
      if (!this.existsSync(resolvedPath)) {
        console.error(`Error creating directory ${resolvedPath}:`, error);
      }
    }
  }

  /**
   * Write a file
   */
  writeFileSync(filePath: string, data: string, encoding?: string): void {
    const resolvedPath = this.resolvePath(filePath);

    // Ensure parent directory exists
    const dirPath = path.dirname(resolvedPath);
    if (!this.existsSync(dirPath)) {
      this.mkdirSync(dirPath, { recursive: true });
    }

    try {
      this.vol.writeFileSync(resolvedPath, data, encoding);
    } catch (error) {
      console.error(`Error writing file ${resolvedPath}:`, error);
      throw error;
    }
  }

  /**
   * Read a file
   */
  readFileSync(filePath: string, encoding: string = 'utf8'): string {
    const resolvedPath = this.resolvePath(filePath);
    try {
      return this.vol.readFileSync(resolvedPath, encoding).toString();
    } catch (error) {
      console.error(`Error reading file ${resolvedPath}:`, error);
      throw error;
    }
  }

  /**
   * Read a directory
   */
  readDir(dirPath: string): string[] {
    const resolvedPath = this.resolvePath(dirPath);
    try {
      return this.vol.readdirSync(resolvedPath);
    } catch (error) {
      console.error(`Error reading directory ${resolvedPath}:`, error);
      return [];
    }
  }

  /**
   * Remove a file
   */
  remove(filePath: string): void {
    const resolvedPath = this.resolvePath(filePath);
    try {
      if (this.isDirectory(resolvedPath)) {
        this.vol.rmdirSync(resolvedPath, { recursive: true });
      } else {
        this.vol.unlinkSync(resolvedPath);
      }
    } catch (error) {
      console.error(`Error removing ${resolvedPath}:`, error);
    }
  }

  /**
   * Check if a path is a directory
   */
  isDirectory(dirPath: string): boolean {
    const resolvedPath = this.resolvePath(dirPath);
    try {
      return this.vol.existsSync(resolvedPath) && this.vol.statSync(resolvedPath).isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the contents of the filesystem for debugging
   */
  toJSON(): Record<string, any> {
    return this.vol.toJSON();
  }

  /**
   * Print the filesystem contents for debugging
   */
  print(): void {
    console.log('FileSystem Contents:', JSON.stringify(this.toJSON(), null, 2));
  }
}