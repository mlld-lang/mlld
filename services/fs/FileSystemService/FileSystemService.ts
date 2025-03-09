import * as fsExtra from 'fs-extra';
import { filesystemLogger as logger } from '@core/utils/logger.js';
import { IFileSystemService } from './IFileSystemService.js';
import { IPathOperationsService } from './IPathOperationsService.js';
import { IFileSystem } from './IFileSystem.js';
import { NodeFileSystem } from './NodeFileSystem.js';
import { MeldError } from '@core/errors/MeldError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MeldFileSystemError } from '@core/errors/MeldFileSystemError.js';
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IServiceMediator } from '@services/mediator/IServiceMediator.js';
import { IPathService } from '../PathService/IPathService.js';

const execAsync = promisify(exec);

interface FileOperationContext {
  operation: string;
  path: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

@injectable()
@Service({
  description: 'Service for file system operations'
})
export class FileSystemService implements IFileSystemService {
  private fs: IFileSystem;
  private serviceMediator?: IServiceMediator;

  constructor(
    @inject('IPathOperationsService') private readonly pathOps: IPathOperationsService,
    @inject('ServiceMediator') serviceMediator?: IServiceMediator,
    @inject('IFileSystem') fileSystem: IFileSystem | null = null
  ) {
    this.fs = fileSystem || new NodeFileSystem();
    this.serviceMediator = serviceMediator;
    
    // Register this service with the mediator if available
    if (this.serviceMediator) {
      this.serviceMediator.setFileSystemService(this);
    }
  }

  /**
   * Sets the service mediator for breaking circular dependencies
   */
  setMediator(mediator: IServiceMediator): void {
    this.serviceMediator = mediator;
    this.serviceMediator.setFileSystemService(this);
  }

  setFileSystem(fileSystem: IFileSystem): void {
    this.fs = fileSystem;
  }

  getFileSystem(): IFileSystem {
    return this.fs;
  }

  /**
   * @deprecated Use setMediator instead
   */
  setPathService(pathService: IPathService): void {
    logger.warn('setPathService is deprecated. Use setMediator instead.');
    // This method is kept for backward compatibility only
  }

  private resolvePath(filePath: string): string {
    // If we have a ServiceMediator, use it for resolving paths
    if (this.serviceMediator) {
      return this.serviceMediator.resolvePath(filePath);
    }
    
    // Fall back to direct path usage if ServiceMediator is not available
    logger.warn('No ServiceMediator available for path resolution', { filePath });
    return filePath;
  }

  // File operations
  async readFile(filePath: string): Promise<string> {
    const resolvedPath = this.resolvePath(filePath);
    
    const context: FileOperationContext = {
      operation: 'readFile',
      path: filePath,
      resolvedPath
    };

    try {
      logger.debug('Reading file', context);
      const content = await this.fs.readFile(resolvedPath);
      logger.debug('Successfully read file', { ...context, contentLength: content.length });
      return content;
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('ENOENT')) {
        logger.error('File not found', { ...context, error: err });
        throw new MeldFileNotFoundError(filePath, { cause: err });
      }
      logger.error('Error reading file', { ...context, error: err });
      throw new MeldError(`Error reading file: ${filePath}`, { 
        cause: err,
        filePath
      });
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = this.resolvePath(filePath);
    
    const context: FileOperationContext = {
      operation: 'writeFile',
      path: filePath,
      resolvedPath,
      details: { contentLength: content.length }
    };

    try {
      logger.debug('Writing file', context);
      await this.ensureDir(this.pathOps.dirname(resolvedPath));
      await this.fs.writeFile(resolvedPath, content);
      logger.debug('Successfully wrote file', context);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to write file', { ...context, error: err });
      throw new MeldError(`Failed to write file: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolvePath(filePath);
    
    const context: FileOperationContext = {
      operation: 'exists',
      path: filePath,
      resolvedPath
    };

    try {
      logger.debug('Checking if path exists', context);
      const exists = await this.fs.exists(resolvedPath);
      logger.debug('Path existence check complete', { ...context, exists });
      return exists;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check path existence', { ...context, error: err });
      throw new MeldError(`Failed to check if path exists: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  async stat(filePath: string): Promise<fsExtra.Stats> {
    const resolvedPath = this.resolvePath(filePath);
    
    const context: FileOperationContext = {
      operation: 'stat',
      path: filePath,
      resolvedPath
    };

    try {
      logger.debug('Getting file stats', context);
      const stats = await this.fs.stat(resolvedPath);
      logger.debug('Successfully got file stats', { ...context, isDirectory: stats.isDirectory() });
      return stats;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get file stats', { ...context, error: err });
      throw new MeldError(`Failed to get file stats: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  // Directory operations
  async readDir(dirPath: string): Promise<string[]> {
    const resolvedPath = this.resolvePath(dirPath);
    
    const context: FileOperationContext = {
      operation: 'readDir',
      path: dirPath,
      resolvedPath
    };

    try {
      logger.debug('Reading directory', context);
      const files = await this.fs.readDir(resolvedPath);
      logger.debug('Successfully read directory', { ...context, fileCount: files.length });
      return files;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to read directory', { ...context, error: err });
      throw new MeldError(`Failed to read directory: ${dirPath}`, {
        cause: err,
        filePath: dirPath
      });
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    const resolvedPath = this.resolvePath(dirPath);
    
    const context: FileOperationContext = {
      operation: 'ensureDir',
      path: dirPath,
      resolvedPath
    };

    try {
      logger.debug('Ensuring directory exists', context);
      await this.fs.mkdir(resolvedPath);
      logger.debug('Successfully ensured directory exists', context);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to ensure directory exists', { ...context, error: err });
      throw new MeldError(`Failed to ensure directory exists: ${dirPath}`, {
        cause: err,
        filePath: dirPath
      });
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolvePath(filePath);
    
    const context: FileOperationContext = {
      operation: 'isDirectory',
      path: filePath,
      resolvedPath
    };

    try {
      logger.debug('Checking if path is directory', context);
      const isDir = await this.fs.isDirectory(resolvedPath);
      logger.debug('Path directory check complete', { ...context, isDirectory: isDir });
      return isDir;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check if path is directory', { ...context, error: err });
      throw new MeldError(`Failed to check if path is directory: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolvePath(filePath);
    
    const context: FileOperationContext = {
      operation: 'isFile',
      path: filePath,
      resolvedPath
    };

    try {
      logger.debug('Checking if path is file', context);
      const isFile = await this.fs.isFile(resolvedPath);
      logger.debug('Path file check complete', { ...context, isFile });
      return isFile;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check if path is file', { ...context, error: err });
      throw new MeldError(`Failed to check if path is file: ${filePath}`, {
        cause: err,
        filePath
      });
    }
  }

  getCwd(): string {
    return process.cwd();
  }

  // Add dirname method that delegates to PathOperationsService
  dirname(filePath: string): string {
    return this.pathOps.dirname(filePath);
  }

  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    const resolvedPath = this.resolvePath(path);
    
    const context: FileOperationContext = {
      operation: 'watch',
      path,
      resolvedPath,
      details: { options }
    };

    try {
      logger.debug('Starting file watch', context);
      return this.fs.watch(resolvedPath, options);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to watch file', { ...context, error: err });
      throw new MeldError(`Failed to watch file: ${path}`, {
        cause: err,
        filePath: path
      });
    }
  }

  async executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
    // We don't need to resolve paths for command execution
    const context = {
      operation: 'executeCommand',
      command,
      cwd: options?.cwd
    };

    try {
      logger.debug('Executing command', context);
      const { stdout, stderr } = await this.fs.executeCommand(command, options);
      logger.debug('Command executed successfully', { ...context, stdout, stderr });
      return { stdout, stderr };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to execute command', { ...context, error: err });
      throw new MeldFileSystemError(`Failed to execute command: ${command}`, {
        cause: err,
        command
      });
    }
  }
} 