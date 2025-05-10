import { MemfsTestFileSystem } from './utils/MemfsTestFileSystem';
import { IFileSystemAdapter } from '../src/explorer';
import * as nodePath from 'path';
import { PathResolver } from './utils/PathResolver';

/**
 * Adapter that uses memfs for testing
 */
export class MemfsAdapter implements IFileSystemAdapter {
  private memfs: MemfsTestFileSystem;
  private pathResolver: PathResolver;

  constructor() {
    this.memfs = new MemfsTestFileSystem();
    this.memfs.initialize();
    this.pathResolver = new PathResolver('project');
  }

  /**
   * Helper to convert a path for memfs
   */
  private getMemfsPath(filePath: string): string {
    return this.pathResolver.toMemfsPath(filePath);
  }

  writeFileSync(path: string, content: string, encoding?: string): void {
    // Get memfs path and create parent directories
    const memfsPath = this.getMemfsPath(path);
    const dirPath = nodePath.dirname(memfsPath);

    // Ensure parent directory exists
    if (!this.memfs.vol.existsSync(dirPath)) {
      this.memfs.vol.mkdirSync(dirPath, { recursive: true });
    }

    console.log('Actually writing file:', memfsPath, 'dirname:', dirPath);
    this.memfs.vol.writeFileSync(memfsPath, content);
  }

  readFileSync(path: string, encoding?: string): string {
    const memfsPath = this.getMemfsPath(path);
    return this.memfs.vol.readFileSync(memfsPath, encoding || 'utf-8').toString();
  }

  existsSync(path: string): boolean {
    // Use the volume directly to check existence synchronously
    const memfsPath = this.getMemfsPath(path);
    return this.memfs.vol.existsSync(memfsPath);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    const memfsPath = this.getMemfsPath(path);
    this.memfs.vol.mkdirSync(memfsPath, options);
  }

  readdirSync(path: string): string[] {
    const memfsPath = this.getMemfsPath(path);
    if (!this.memfs.vol.existsSync(memfsPath)) {
      return [];
    }
    return this.memfs.vol.readdirSync(memfsPath);
  }

  rmSync(path: string, options?: { recursive?: boolean, force?: boolean }): void {
    const memfsPath = this.getMemfsPath(path);
    if (this.memfs.vol.existsSync(memfsPath)) {
      if (this.memfs.vol.statSync(memfsPath).isDirectory()) {
        this.memfs.vol.rmdirSync(memfsPath, { recursive: true });
      } else {
        this.memfs.vol.unlinkSync(memfsPath);
      }
    }
  }
  
  /**
   * Get the underlying memfs instance
   */
  getMemfs(): MemfsTestFileSystem {
    return this.memfs;
  }
  
  /**
   * Show the contents of memfs (for debugging)
   */
  dump(): Record<string, string> {
    return this.memfs.vol.toJSON();
  }
  
  /**
   * Check if a path exists asynchronously (for compatibility)
   */
  async exists(filePath: string): Promise<boolean> {
    return this.existsSync(filePath);
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.memfs.cleanup();
  }
}