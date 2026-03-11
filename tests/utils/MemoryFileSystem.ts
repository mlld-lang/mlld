import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { VirtualFS } from '@services/fs/VirtualFS';

/**
 * Test-facing memory filesystem wrapper.
 * Keeps the existing helper API while delegating filesystem semantics to VirtualFS.
 */
export class MemoryFileSystem implements IFileSystemService {
  private readonly vfs = VirtualFS.empty();

  async readFile(filePath: string): Promise<string> {
    return await this.vfs.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.vfs.writeFile(filePath, content);
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    await this.vfs.appendFile(filePath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    return await this.vfs.exists(filePath);
  }

  async access(filePath: string): Promise<void> {
    await this.vfs.access(filePath);
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      await this.vfs.mkdir(dirPath, options);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      // Preserve historical MemoryFileSystem behavior: non-recursive mkdir
      // still creates parent segments in test environments.
      if (!options?.recursive && nodeError.code === 'ENOENT') {
        await this.vfs.mkdir(dirPath, { recursive: true });
        return;
      }
      throw error;
    }
  }

  async readdir(dirPath: string): Promise<string[]> {
    return await this.vfs.readdir(dirPath);
  }

  async unlink(filePath: string): Promise<void> {
    await this.vfs.unlink(filePath);
  }

  async rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await this.vfs.rm(filePath, options);
  }

  async isDirectory(filePath: string): Promise<boolean> {
    return await this.vfs.isDirectory(filePath);
  }

  async stat(filePath: string): Promise<{ isDirectory(): boolean; isFile(): boolean; size?: number }> {
    return await this.vfs.stat(filePath);
  }

  isVirtual(): boolean {
    return this.vfs.isVirtual();
  }

  // Test helper used by command execution tests.
  async execute(command: string, _options?: any): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return {
      stdout: `Mock output for: ${command}`,
      stderr: '',
      exitCode: 0
    };
  }

  getVirtualFS(): VirtualFS {
    return this.vfs;
  }
}
