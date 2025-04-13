import * as fsExtra from 'fs-extra';
import { filesystemLogger as logger } from '@core/utils/logger.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathOperationsService } from '@services/fs/FileSystemService/IPathOperationsService.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MeldFileSystemError } from '@core/errors/MeldFileSystemError.js';
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient.js';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import type { ValidatedResourcePath, RawPath } from '@core/types/paths.js';
import { createRawPath } from '@core/types/paths.js';

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
  private pathClient?: IPathServiceClient;
  private factoryInitialized: boolean = false;

  /**
   * Creates a new instance of the FileSystemService
   * 
   * @param pathOps - Service for handling path operations and normalization
   * @param fileSystem - File system implementation to use (optional, defaults to NodeFileSystem)
   * @param pathClientFactory - Factory for creating PathServiceClient instances
   */
  constructor(
    @inject('IPathOperationsService') private readonly pathOps: IPathOperationsService,
    @inject('IFileSystem') fileSystem?: IFileSystem,
    @inject('PathServiceClientFactory') private readonly pathClientFactory?: PathServiceClientFactory
  ) {
    // Set file system implementation
    this.fs = fileSystem || new NodeFileSystem();
    
    // Initialize factory if available - REMOVED to avoid circular dependency
    // this.ensureFactoryInitialized();
    
    if (process.env.DEBUG === 'true') {
      console.log('FileSystemService: Initialized with', {
        hasPathOps: !!this.pathOps,
        hasPathClientFactory: !!this.pathClientFactory,
        hasPathClient: !!this.pathClient,
        fileSystemType: this.fs.constructor.name
      });
    }
  }

  /**
   * Lazily initialize the PathServiceClient factory
   * This is called only when needed to avoid circular dependencies
   */
  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    // Use factory if available
    if (this.pathClientFactory && typeof this.pathClientFactory.createClient === 'function') {
      try {
        this.pathClient = this.pathClientFactory.createClient();
        logger.debug('Successfully created PathServiceClient using factory');
      } catch (error) {
        logger.warn('Failed to create PathServiceClient', { error });
        if (process.env.NODE_ENV !== 'test') {
          throw new MeldFileSystemError('Failed to create PathServiceClient - factory pattern required', { 
            cause: error as Error,
            code: 'DI_FACTORY_ERROR',
            severity: ErrorSeverity.Fatal 
          });
        }
      }
    } else {
      logger.warn('PathServiceClientFactory not available or invalid - factory pattern required');
      if (process.env.NODE_ENV !== 'test') {
        throw new MeldFileSystemError('PathServiceClientFactory not available - factory pattern required', {
          code: 'DI_FACTORY_MISSING',
          severity: ErrorSeverity.Fatal
        });
      }
    }
  }

  /**
   * Sets the file system implementation
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use dependency injection instead by registering the file system implementation with the DI container.
   * @param fileSystem - The file system implementation to use
   */
  setFileSystem(fileSystem: IFileSystem): void {
    logger.warn('FileSystemService.setFileSystem is deprecated. Use dependency injection instead.');
    this.fs = fileSystem;
  }

  /**
   * Gets the current file system implementation
   * @returns The current file system implementation
   */
  getFileSystem(): IFileSystem {
    return this.fs;
  }

  /**
   * Resolves a path to an absolute path
   * 
   * @param filePath - Path to resolve
   * @returns The resolved absolute path
   */
  resolvePath(filePath: string | ValidatedResourcePath): string {
    try {
      const pathString = typeof filePath === 'string' ? filePath : filePath as string;
      
      // Use the path client if available
      if (this.pathClient) {
        try {
          return this.pathClient.resolvePath(createRawPath(pathString));
        } catch (error) {
          logger.warn('Error using pathClient.resolvePath, falling back to pathOps', { 
            error: error instanceof Error ? error.message : String(error), 
            filePath: pathString 
          });
        }
      }
      
      // Fall back to path operations service
      return this.pathOps.resolvePath(createRawPath(pathString));
    } catch (error) {
      logger.warn('Error resolving path', {
        path: filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Last resort fallback
      return typeof filePath === 'string' ? filePath : filePath as string;
    }
  }

  // File operations
  async readFile(filePath: ValidatedResourcePath): Promise<string> {
    const pathString = filePath as string;
    
    const context: FileOperationContext = {
      operation: 'readFile',
      path: pathString,
    };
    
    try {
      logger.debug('Reading file', context);
      const content = await this.fs.readFile(pathString);
      logger.debug('Successfully read file', { ...context, contentLength: content.length });
      return content;
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('ENOENT')) {
        logger.error('File not found', { ...context, error: err });
        throw new MeldFileNotFoundError(`File not found: ${pathString}`, {
          details: { filePath: pathString },
          cause: err
        });
      }
      logger.error('Error reading file', { ...context, error: err });
      throw new MeldFileSystemError(`Error reading file: ${pathString}`, { 
        cause: err, 
        code: 'FS_READ_ERROR',
        severity: ErrorSeverity.Fatal,
        details: { path: pathString }
      });
    }
  }

  async writeFile(filePath: ValidatedResourcePath, content: string): Promise<void> {
    const pathString = filePath as string;
    
    const context: FileOperationContext = {
      operation: 'writeFile',
      path: pathString,
      details: { contentLength: content.length }
    };

    try {
      logger.debug('Writing file', context);
      await this.ensureDir(this.pathOps.dirname(pathString) as ValidatedResourcePath);
      await this.fs.writeFile(pathString, content);
      logger.debug('Successfully wrote file', context);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to write file', { ...context, error: err });
      throw new MeldFileSystemError(`Failed to write file: ${pathString}`, {
        cause: err,
        code: 'FS_WRITE_ERROR',
        severity: ErrorSeverity.Fatal,
        details: { path: pathString }
      });
    }
  }

  async exists(filePath: ValidatedResourcePath): Promise<boolean> {
    const pathString = filePath as string;
    try {
      const context: FileOperationContext = {
        operation: 'exists',
        path: pathString
      };
      
      logger.debug('Checking if path exists', context);
      
      return await this.fs.exists(pathString);
    } catch (error) {
      logger.warn('Error checking if path exists', {
        path: pathString,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Checks if a file exists (combines exists and isFile checks)
   * 
   * @param filePath - Path to check
   * @returns A promise that resolves with true if the path exists and is a file, false otherwise
   */
  async fileExists(filePath: ValidatedResourcePath): Promise<boolean> {
    const pathString = filePath as string;
    try {
      const context: FileOperationContext = {
        operation: 'fileExists',
        path: pathString
      };
      
      logger.debug('Checking if file exists', context);
      
      const exists = await this.exists(filePath);
      if (!exists) {
        return false;
      }
      
      return await this.isFile(filePath);
    } catch (error) {
      logger.warn('Error checking if file exists', {
        path: pathString,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  async stat(filePath: ValidatedResourcePath): Promise<fsExtra.Stats> {
    const pathString = filePath as string;
    
    const context: FileOperationContext = {
      operation: 'stat',
      path: pathString,
    };

    try {
      logger.debug('Getting file stats', context);
      const stats = await this.fs.stat(pathString);
      logger.debug('Successfully got file stats', { ...context, isDirectory: stats.isDirectory() });
      return stats;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get file stats', { ...context, error: err });
      throw new MeldFileSystemError(`Failed to get file stats: ${pathString}`, {
        cause: err,
        code: 'FS_STAT_ERROR',
        severity: ErrorSeverity.Warning,
        details: { path: pathString }
      });
    }
  }

  // Directory operations
  async readDir(dirPath: ValidatedResourcePath): Promise<string[]> {
    const pathString = dirPath as string;
    
    const context: FileOperationContext = {
      operation: 'readDir',
      path: pathString,
    };

    try {
      logger.debug('Reading directory', context);
      const files = await this.fs.readDir(pathString);
      logger.debug('Successfully read directory', { ...context, fileCount: files.length });
      return files;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to read directory', { ...context, error: err });
      throw new MeldFileSystemError(`Failed to read directory: ${pathString}`, {
        cause: err,
        code: 'FS_READDIR_ERROR',
        severity: ErrorSeverity.Fatal,
        details: { path: pathString }
      });
    }
  }

  async ensureDir(dirPath: ValidatedResourcePath): Promise<void> {
    const pathString = dirPath as string;
    
    const context: FileOperationContext = {
      operation: 'ensureDir',
      path: pathString,
    };

    try {
      logger.debug('Ensuring directory exists', context);
      await this.fs.mkdir(pathString);
      logger.debug('Successfully ensured directory exists', context);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to ensure directory exists', { ...context, error: err });
      throw new MeldFileSystemError(`Failed to ensure directory exists: ${pathString}`, {
        cause: err,
        code: 'FS_MKDIR_ERROR',
        severity: ErrorSeverity.Fatal,
        details: { path: pathString }
      });
    }
  }

  async isDirectory(filePath: ValidatedResourcePath): Promise<boolean> {
    const pathString = filePath as string;
    
    const context: FileOperationContext = {
      operation: 'isDirectory',
      path: pathString,
    };

    try {
      logger.debug('Checking if path is directory', context);
      const isDir = await this.fs.isDirectory(pathString);
      logger.debug('Path directory check complete', { ...context, isDirectory: isDir });
      return isDir;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check if path is directory', { ...context, error: err });
      throw new MeldFileSystemError(`Failed to check if path is directory: ${pathString}`, {
        cause: err,
        code: 'FS_STAT_ERROR', 
        severity: ErrorSeverity.Warning,
        details: { path: pathString }
      });
    }
  }

  async isFile(filePath: ValidatedResourcePath): Promise<boolean> {
    const pathString = filePath as string;
    
    const context: FileOperationContext = {
      operation: 'isFile',
      path: pathString,
    };

    try {
      logger.debug('Checking if path is file', context);
      const isFile = await this.fs.isFile(pathString);
      logger.debug('Path file check complete', { ...context, isFile });
      return isFile;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check if path is file', { ...context, error: err });
      throw new MeldFileSystemError(`Failed to check if path is file: ${pathString}`, {
        cause: err,
        code: 'FS_STAT_ERROR',
        severity: ErrorSeverity.Warning,
        details: { path: pathString }
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

  watch(path: ValidatedResourcePath, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }> {
    const context: FileOperationContext = {
      operation: 'watch',
      path: path as string,
      details: { options }
    };

    try {
      logger.debug('Starting file watch', context);
      return this.fs.watch(path as ValidatedResourcePath, options);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to watch file', { ...context, error: err });
      throw new MeldFileSystemError(`Failed to watch file: ${path as string}`, { 
        cause: err,
        code: 'FS_WATCH_ERROR',
        severity: ErrorSeverity.Fatal,
        details: { path: path as string }
      });
    }
  }

  async executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
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
        command,
        code: 'FS_EXEC_ERROR',
        severity: ErrorSeverity.Fatal
      });
    }
  }

  /**
   * Creates a directory and any necessary parent directories.
   * 
   * @deprecated Use `ensureDir` instead. This method will be removed in a future version.
   * @param dirPath - Path to the directory to create
   * @param options - Options for directory creation
   * @param options.recursive - Whether to create parent directories if they don't exist
   * @returns A promise that resolves when the directory is created
   * @throws {MeldFileSystemError} If the directory cannot be created
   */
  async mkdir(dirPath: ValidatedResourcePath, options?: { recursive?: boolean }): Promise<void> {
    logger.warn('FileSystemService.mkdir is deprecated. Use ensureDir instead.');
    return this.ensureDir(dirPath as ValidatedResourcePath);
  }
} 