import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { MemfsTestFileSystem } from './MemfsTestFileSystem.js';

export class MemfsTestFileSystemAdapter extends NodeFileSystem {
  constructor(private readonly memfs: MemfsTestFileSystem) {
    super();
  }

  // Async methods
  async readFile(filePath: string): Promise<string> {
    return this.memfs.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.memfs.writeFile(filePath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.memfs.exists(filePath);
  }

  async mkdir(dirPath: string): Promise<void> {
    await this.memfs.mkdir(dirPath);
  }

  async readDir(dirPath: string): Promise<string[]> {
    return this.memfs.readDir(dirPath);
  }

  async stat(filePath: string): Promise<any> {
    return this.memfs.stat(filePath);
  }

  async isDirectory(filePath: string): Promise<boolean> {
    return this.memfs.isDirectory(filePath);
  }

  async isFile(filePath: string): Promise<boolean> {
    return this.memfs.isFile(filePath);
  }

  async *watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    yield* this.memfs.watch(path, options);
  }

  // Sync methods needed for CLI testing
  readFileSync(filePath: string): string {
    return this.memfs.readFileSync(filePath);
  }

  writeFileSync(filePath: string, content: string): void {
    this.memfs.writeFileSync(filePath, content);
  }

  existsSync(filePath: string): boolean {
    return this.memfs.existsSync(filePath);
  }

  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    this.memfs.mkdirSync(dirPath, options);
  }

  readDirSync(dirPath: string): string[] {
    return this.memfs.readDirSync(dirPath);
  }

  statSync(filePath: string): any {
    return this.memfs.statSync(filePath);
  }

  isDirectorySync(filePath: string): boolean {
    return this.memfs.isDirectorySync(filePath);
  }

  isFileSync(filePath: string): boolean {
    return this.memfs.isFileSync(filePath);
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
  
  // Override read/write methods to automatically resolve special paths
  async readFile(filePath: string): Promise<string> {
    return super.readFile(this.resolveSpecialPaths(filePath));
  }
  
  async writeFile(filePath: string, content: string): Promise<void> {
    await super.writeFile(this.resolveSpecialPaths(filePath), content);
  }
  
  async exists(filePath: string): Promise<boolean> {
    return super.exists(this.resolveSpecialPaths(filePath));
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
} 