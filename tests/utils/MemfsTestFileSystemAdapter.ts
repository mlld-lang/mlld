import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { MemfsTestFileSystem } from './MemfsTestFileSystem.js';

export class MemfsTestFileSystemAdapter extends NodeFileSystem {
  constructor(private readonly memfs: MemfsTestFileSystem) {
    super();
  }

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
} 