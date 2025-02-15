import * as fs from 'fs-extra';
import * as path from 'path';
import { fsLogger as logger } from '../../core/utils/simpleLogger';
import { IFileSystemService } from './IFileSystemService';
import { MemfsTestFileSystem } from '../../tests/utils/MemfsTestFileSystem';
import { MeldError } from '../../core/errors/MeldError';

export class FileSystemService implements IFileSystemService {
  private testMode = false;
  private testFs: MemfsTestFileSystem | null = null;

  constructor(testFs?: MemfsTestFileSystem) {
    if (testFs) {
      this.enableTestMode(testFs);
    }
  }

  // File operations
  async readFile(filePath: string): Promise<string> {
    try {
      if (this.testMode && this.testFs) {
        return await this.testFs.readFile(this.normalize(filePath));
      }
      
      logger.debug('Reading file', { filePath });
      const content = await fs.readFile(filePath, 'utf-8');
      logger.debug('Successfully read file', { filePath, contentLength: content.length });
      return content;
    } catch (error) {
      logger.error('Failed to read file', { filePath, error });
      throw new MeldError(`Failed to read file: ${filePath}`, { cause: error });
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      if (this.testMode && this.testFs) {
        await this.testFs.writeFile(this.normalize(filePath), content);
        return;
      }

      logger.debug('Writing file', { filePath, contentLength: content.length });
      // Ensure parent directory exists
      await this.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf-8');
      logger.debug('Successfully wrote file', { filePath });
    } catch (error) {
      logger.error('Failed to write file', { filePath, error });
      throw new MeldError(`Failed to write file: ${filePath}`, { cause: error });
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      if (this.testMode && this.testFs) {
        return await this.testFs.exists(this.normalize(filePath));
      }

      logger.debug('Checking if path exists', { filePath });
      const exists = await fs.pathExists(filePath);
      logger.debug('Path existence check complete', { filePath, exists });
      return exists;
    } catch (error) {
      logger.error('Failed to check path existence', { filePath, error });
      throw new MeldError(`Failed to check if path exists: ${filePath}`, { cause: error });
    }
  }

  async stat(filePath: string): Promise<fs.Stats> {
    try {
      if (this.testMode && this.testFs) {
        return await this.testFs.stat(this.normalize(filePath));
      }

      logger.debug('Getting file stats', { filePath });
      const stats = await fs.stat(filePath);
      logger.debug('Successfully got file stats', { filePath, isDirectory: stats.isDirectory() });
      return stats;
    } catch (error) {
      logger.error('Failed to get file stats', { filePath, error });
      throw new MeldError(`Failed to get file stats: ${filePath}`, { cause: error });
    }
  }

  // Directory operations
  async readDir(dirPath: string): Promise<string[]> {
    try {
      if (this.testMode && this.testFs) {
        return await this.testFs.readDir(this.normalize(dirPath));
      }

      logger.debug('Reading directory', { dirPath });
      const files = await fs.readdir(dirPath);
      logger.debug('Successfully read directory', { dirPath, fileCount: files.length });
      return files;
    } catch (error) {
      logger.error('Failed to read directory', { dirPath, error });
      throw new MeldError(`Failed to read directory: ${dirPath}`, { cause: error });
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    try {
      if (this.testMode && this.testFs) {
        await this.testFs.ensureDir(this.normalize(dirPath));
        return;
      }

      logger.debug('Ensuring directory exists', { dirPath });
      await fs.ensureDir(dirPath);
      logger.debug('Successfully ensured directory exists', { dirPath });
    } catch (error) {
      logger.error('Failed to ensure directory exists', { dirPath, error });
      throw new MeldError(`Failed to ensure directory exists: ${dirPath}`, { cause: error });
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      if (this.testMode && this.testFs) {
        return await this.testFs.isDirectory(this.normalize(filePath));
      }

      logger.debug('Checking if path is directory', { filePath });
      const stats = await fs.stat(filePath);
      const isDir = stats.isDirectory();
      logger.debug('Path directory check complete', { filePath, isDirectory: isDir });
      return isDir;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      logger.error('Failed to check if path is directory', { filePath, error });
      throw new MeldError(`Failed to check if path is directory: ${filePath}`, { cause: error });
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    try {
      if (this.testMode && this.testFs) {
        return await this.testFs.isFile(this.normalize(filePath));
      }

      logger.debug('Checking if path is file', { filePath });
      const stats = await fs.stat(filePath);
      const isFile = stats.isFile();
      logger.debug('Path file check complete', { filePath, isFile });
      return isFile;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      logger.error('Failed to check if path is file', { filePath, error });
      throw new MeldError(`Failed to check if path is file: ${filePath}`, { cause: error });
    }
  }

  // Path operations
  join(...paths: string[]): string {
    return path.join(...paths);
  }

  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  normalize(filePath: string): string {
    return path.normalize(filePath);
  }

  // Test mode
  enableTestMode(testFs: MemfsTestFileSystem): void {
    this.testMode = true;
    this.testFs = testFs;
  }

  disableTestMode(): void {
    this.testMode = false;
    this.testFs = null;
  }

  isTestMode(): boolean {
    return this.testMode;
  }

  // Command execution
  async executeCommand(command: string, options?: { cwd?: string }): Promise<CommandResult> {
    if (this.testMode) {
      return { stdout: '', stderr: '' };
    }
    throw new Error('executeCommand not implemented in production mode');
  }

  getCwd(): string {
    if (this.testMode) {
      return '/project';
    }
    return process.cwd();
  }

  // Mock file system (for testing)
  mockFile(path: string, content: string): void {
    if (this.testMode && this.testFs) {
      this.testFs.writeFile(this.normalize(path), content);
    }
  }

  mockDir(path: string): void {
    if (this.testMode && this.testFs) {
      this.testFs.mkdir(this.normalize(path));
    }
  }

  clearMocks(): void {
    if (this.testMode && this.testFs) {
      this.testFs.initialize();
    }
  }
} 