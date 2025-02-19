import * as fs from 'fs-extra';
import { fsLogger as logger } from '@core/utils/simpleLogger.js';
import { IFileSystemService } from './IFileSystemService.js';
import { IPathOperationsService } from './IPathOperationsService.js';
import { IFileSystem } from './IFileSystem.js';
import { NodeFileSystem } from './NodeFileSystem.js';
import { MeldError } from '@core/errors/MeldError.js';

interface FileOperationContext {
  operation: string;
  path: string;
  details?: Record<string, unknown>;
}

export class FileSystemService implements IFileSystemService {
  private fs: IFileSystem;

  constructor(
    private readonly pathOps: IPathOperationsService,
    fileSystem?: IFileSystem
  ) {
    this.fs = fileSystem || new NodeFileSystem();
  }

  setFileSystem(fileSystem: IFileSystem): void {
    this.fs = fileSystem;
  }

  // File operations
  async readFile(filePath: string): Promise<string> {
    const context: FileOperationContext = {
      operation: 'readFile',
      path: filePath
    };

    try {
      logger.debug('Reading file', context);
      const content = await this.fs.readFile(filePath);
      logger.debug('Successfully read file', { ...context, contentLength: content.length });
      return content;
    } catch (error) {
      logger.error('Failed to read file', { ...context, error });
      throw new MeldError(`Failed to read file: ${filePath}`, { 
        cause: error,
        context
      });
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const context: FileOperationContext = {
      operation: 'writeFile',
      path: filePath,
      details: { contentLength: content.length }
    };

    try {
      logger.debug('Writing file', context);
      await this.ensureDir(this.pathOps.dirname(filePath));
      await this.fs.writeFile(filePath, content);
      logger.debug('Successfully wrote file', context);
    } catch (error) {
      logger.error('Failed to write file', { ...context, error });
      throw new MeldError(`Failed to write file: ${filePath}`, {
        cause: error,
        context
      });
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const context: FileOperationContext = {
      operation: 'exists',
      path: filePath
    };

    try {
      logger.debug('Checking if path exists', context);
      const exists = await this.fs.exists(filePath);
      logger.debug('Path existence check complete', { ...context, exists });
      return exists;
    } catch (error) {
      logger.error('Failed to check path existence', { ...context, error });
      throw new MeldError(`Failed to check if path exists: ${filePath}`, {
        cause: error,
        context
      });
    }
  }

  async stat(filePath: string): Promise<fs.Stats> {
    const context: FileOperationContext = {
      operation: 'stat',
      path: filePath
    };

    try {
      logger.debug('Getting file stats', context);
      const stats = await this.fs.stat(filePath);
      logger.debug('Successfully got file stats', { ...context, isDirectory: stats.isDirectory() });
      return stats;
    } catch (error) {
      logger.error('Failed to get file stats', { ...context, error });
      throw new MeldError(`Failed to get file stats: ${filePath}`, {
        cause: error,
        context
      });
    }
  }

  // Directory operations
  async readDir(dirPath: string): Promise<string[]> {
    const context: FileOperationContext = {
      operation: 'readDir',
      path: dirPath
    };

    try {
      logger.debug('Reading directory', context);
      const files = await this.fs.readDir(dirPath);
      logger.debug('Successfully read directory', { ...context, fileCount: files.length });
      return files;
    } catch (error) {
      logger.error('Failed to read directory', { ...context, error });
      throw new MeldError(`Failed to read directory: ${dirPath}`, {
        cause: error,
        context
      });
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    const context: FileOperationContext = {
      operation: 'ensureDir',
      path: dirPath
    };

    try {
      logger.debug('Ensuring directory exists', context);
      await this.fs.mkdir(dirPath);
      logger.debug('Successfully ensured directory exists', context);
    } catch (error) {
      logger.error('Failed to ensure directory exists', { ...context, error });
      throw new MeldError(`Failed to ensure directory exists: ${dirPath}`, {
        cause: error,
        context
      });
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    const context: FileOperationContext = {
      operation: 'isDirectory',
      path: filePath
    };

    try {
      logger.debug('Checking if path is directory', context);
      const isDir = await this.fs.isDirectory(filePath);
      logger.debug('Path directory check complete', { ...context, isDirectory: isDir });
      return isDir;
    } catch (error) {
      logger.error('Failed to check if path is directory', { ...context, error });
      throw new MeldError(`Failed to check if path is directory: ${filePath}`, {
        cause: error,
        context
      });
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    const context: FileOperationContext = {
      operation: 'isFile',
      path: filePath
    };

    try {
      logger.debug('Checking if path is file', context);
      const isFile = await this.fs.isFile(filePath);
      logger.debug('Path file check complete', { ...context, isFile });
      return isFile;
    } catch (error) {
      logger.error('Failed to check if path is file', { ...context, error });
      throw new MeldError(`Failed to check if path is file: ${filePath}`, {
        cause: error,
        context
      });
    }
  }

  getCwd(): string {
    return process.cwd();
  }

  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    const context: FileOperationContext = {
      operation: 'watch',
      path,
      details: { options }
    };

    try {
      logger.debug('Starting file watch', context);
      return this.fs.watch(path, options);
    } catch (error) {
      logger.error('Failed to watch file', { ...context, error });
      throw new MeldError(`Failed to watch file: ${path}`, {
        cause: error,
        context
      });
    }
  }
} 