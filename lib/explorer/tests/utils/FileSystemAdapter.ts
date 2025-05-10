import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface for file system operations
 * This allows us to swap out the real file system with a mock for testing
 */
export interface IFileSystemAdapter {
  writeFileSync(path: string, content: string, encoding?: string): void;
  readFileSync(path: string, encoding?: string): string;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  rmSync(path: string, options?: { recursive?: boolean, force?: boolean }): void;
}

/**
 * Implementation that uses the real file system
 */
export class RealFileSystemAdapter implements IFileSystemAdapter {
  writeFileSync(path: string, content: string, encoding: string = 'utf8'): void {
    fs.writeFileSync(path, content, { encoding });
  }

  readFileSync(path: string, encoding: string = 'utf8'): string {
    return fs.readFileSync(path, { encoding }).toString();
  }

  existsSync(path: string): boolean {
    return fs.existsSync(path);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    fs.mkdirSync(path, options);
  }

  readdirSync(path: string): string[] {
    return fs.readdirSync(path);
  }

  rmSync(path: string, options?: { recursive?: boolean, force?: boolean }): void {
    fs.rmSync(path, options);
  }
}

/**
 * Implementation that uses memfs for testing
 */
export class MemfsFileSystemAdapter implements IFileSystemAdapter {
  private memfs: MemfsTestFileSystem;

  constructor(memfs?: MemfsTestFileSystem) {
    this.memfs = memfs || new MemfsTestFileSystem();
    this.memfs.initialize();
  }

  writeFileSync(path: string, content: string, encoding: string = 'utf8'): void {
    this.memfs.writeFileSync(path, content);
  }

  readFileSync(path: string, encoding: string = 'utf8'): string {
    return this.memfs.readFileSync(path);
  }

  existsSync(path: string): boolean {
    return this.memfs.existsSync(path);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    this.memfs.mkdirSync(path, options);
  }

  readdirSync(path: string): string[] {
    return this.memfs.readDir(path);
  }

  rmSync(path: string, options?: { recursive?: boolean, force?: boolean }): void {
    this.memfs.remove(path);
  }
  
  /**
   * Get the underlying memfs instance
   */
  getMemfs(): MemfsTestFileSystem {
    return this.memfs;
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.memfs.cleanup();
  }
}