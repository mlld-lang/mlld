import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { MemfsTestFileSystem } from './MemfsTestFileSystem.js';

import { vi } from 'vitest';

export class MemfsTestFileSystemAdapter extends NodeFileSystem {
  constructor(private readonly memfs: MemfsTestFileSystem) {
    super();
    
    // Add spies to all methods so they can be tracked in tests
    vi.spyOn(this, 'readFile');
    vi.spyOn(this, 'writeFile');
    vi.spyOn(this, 'exists');
    vi.spyOn(this, 'mkdir');
    vi.spyOn(this, 'readDir');
    vi.spyOn(this, 'stat');
    vi.spyOn(this, 'isDirectory');
    vi.spyOn(this, 'isFile');
    vi.spyOn(this, 'watch');
    vi.spyOn(this, 'getFileSystem');
  }

  // Convenience methods
  resolveSpecialPaths(path: string): string {
    if (path.startsWith('$./') || path.startsWith('$PROJECTPATH/')) {
      return '/project/' + path.replace(/^\$\.|^\$PROJECTPATH\//, '').replace(/^\//, '');
    } else if (path.startsWith('$~/') || path.startsWith('$HOMEPATH/')) {
      return '/home/user/' + path.replace(/^\$~\/|^\$HOMEPATH\//, '').replace(/^\//, '');
    }
    return path;
  }

  // Async methods with automatic path resolution
  async readFile(filePath: string): Promise<string> {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.readFile(resolvedPath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    await this.memfs.writeFile(resolvedPath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.exists(resolvedPath);
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const resolvedPath = this.resolveSpecialPaths(dirPath);
    await this.memfs.mkdir(resolvedPath, options);
  }

  async readDir(dirPath: string): Promise<string[]> {
    const resolvedPath = this.resolveSpecialPaths(dirPath);
    return this.memfs.readDir(resolvedPath);
  }

  async stat(filePath: string): Promise<any> {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.stat(resolvedPath);
  }

  async isDirectory(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.isDirectory(resolvedPath);
  }

  async isFile(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.isFile(resolvedPath);
  }

  async *watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    const resolvedPath = this.resolveSpecialPaths(path);
    yield* this.memfs.watch(resolvedPath, options);
  }

  // Sync methods needed for CLI testing with automatic path resolution
  readFileSync(filePath: string): string {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.readFileSync(resolvedPath);
  }

  writeFileSync(filePath: string, content: string): void {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    this.memfs.writeFileSync(resolvedPath, content);
  }

  existsSync(filePath: string): boolean {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.existsSync(resolvedPath);
  }

  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    const resolvedPath = this.resolveSpecialPaths(dirPath);
    if (typeof this.memfs.mkdirSync === 'function') {
      this.memfs.mkdirSync(resolvedPath, options);
    } else {
      // Fallback to async version if sync version not available
      console.log(`mkdirSync fallback for path: ${resolvedPath}`);
      this.memfs.mkdir(resolvedPath, options);
    }
  }

  readDirSync(dirPath: string): string[] {
    const resolvedPath = this.resolveSpecialPaths(dirPath);
    return this.memfs.readDirSync(resolvedPath);
  }

  statSync(filePath: string): any {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.statSync(resolvedPath);
  }

  isDirectorySync(filePath: string): boolean {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.isDirectorySync(resolvedPath);
  }

  isFileSync(filePath: string): boolean {
    const resolvedPath = this.resolveSpecialPaths(filePath);
    return this.memfs.isFileSync(resolvedPath);
  }

  // Additional CLI support methods
  executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Mock implementation for CLI tests
    console.log(`Mock executing command: ${command}`);
    return Promise.resolve({
      stdout: `Mock stdout for: ${command}`,
      stderr: '',
      exitCode: 0
    });
  }
  
  // Required by CLIService.cliToApiOptions
  getFileSystem(): any {
    return this.memfs;
  }
} 