/**
 * Example implementation of service interfaces using shared types
 * 
 * This file demonstrates how to implement service interfaces using shared types
 * to avoid circular dependencies.
 */

import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  PathServiceLike, 
  FileSystemLike,
  ClientFactory,
  ServiceOptions
} from '@core/shared-service-types.js';

/**
 * Simplified FileSystemService interface that uses shared types
 * instead of importing IPathService (avoiding circular dependency)
 */
export interface IFileSystemService extends FileSystemLike {
  /**
   * Initialize the service with dependencies
   * @param options Service options
   */
  initialize(options?: ServiceOptions): void;
  
  /**
   * Read a file as text
   * @param path File path
   * @returns File contents
   */
  readFile(path: string): Promise<string>;
  
  /**
   * Read a file as binary
   * @param path File path
   * @returns File contents
   */
  readFileBuffer(path: string): Promise<Buffer>;
  
  /**
   * Check if a file exists
   * @param path File path
   * @returns Whether the file exists
   */
  fileExists(path: string): Promise<boolean>;
  
  /**
   * List files in a directory
   * @param path Directory path
   * @returns List of files
   */
  listFiles(path: string): Promise<string[]>;
}

/**
 * Simplified PathService interface that uses shared types
 * instead of importing IFileSystemService (avoiding circular dependency)
 */
export interface IPathService extends PathServiceLike {
  /**
   * Initialize the service with dependencies
   * @param fileSystemLike A file system implementation (using abstract type)
   * @param options Service options
   */
  initialize(fileSystemLike?: FileSystemLike, options?: ServiceOptions): void;
  
  /**
   * Validate a path
   * @param path The path to validate
   * @returns Whether the path is valid
   */
  validatePath(path: string): Promise<boolean>;
  
  /**
   * Resolve a path
   * @param path The path to resolve
   * @returns The resolved path
   */
  resolvePath(path: string): string;
  
  /**
   * Get the directory name of a path
   * @param path The path to get the directory name from
   * @returns The directory name
   */
  getDirname(path: string): string;
}

/**
 * FileSystemServiceClient interface (minimal interface for client usage)
 */
export interface IFileSystemServiceClient {
  fileExists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
}

/**
 * PathServiceClient interface (minimal interface for client usage)
 */
export interface IPathServiceClient {
  resolvePath(path: string): string;
  validatePath(path: string): Promise<boolean>;
}

/**
 * FileSystemServiceClientFactory implementation using shared types
 */
@injectable()
@Service({
  description: 'Factory for creating FileSystemService clients'
})
export class FileSystemServiceClientFactory implements ClientFactory<IFileSystemServiceClient> {
  constructor(
    // Using the shared type (FileSystemLike) rather than concrete implementation
    @inject('FileSystemService') private fileSystem: FileSystemLike
  ) {}
  
  createClient(): IFileSystemServiceClient {
    return {
      fileExists: (path: string) => this.fileSystem.fileExists(path),
      readFile: (path: string) => this.fileSystem.readFile(path)
    };
  }
}

/**
 * PathServiceClientFactory implementation using shared types
 */
@injectable()
@Service({
  description: 'Factory for creating PathService clients'
})
export class PathServiceClientFactory implements ClientFactory<IPathServiceClient> {
  constructor(
    // Using the shared type (PathServiceLike) rather than concrete implementation
    @inject('PathService') private pathService: PathServiceLike
  ) {}
  
  createClient(): IPathServiceClient {
    return {
      resolvePath: (path: string) => this.pathService.resolvePath(path),
      validatePath: (path: string) => this.pathService.validatePath(path)
    };
  }
}

/**
 * FileSystemService implementation that uses PathServiceLike
 * to avoid circular dependency with PathService
 */
@injectable()
@Service({
  description: 'Service for file system operations'
})
export class FileSystemService implements IFileSystemService {
  private pathService?: PathServiceLike;
  
  constructor(
    // Using factory pattern with shared types
    @inject(PathServiceClientFactory) private pathServiceFactory?: ClientFactory<IPathServiceClient>
  ) {}
  
  initialize(options?: ServiceOptions): void {
    // Lazy initialization to avoid circular dependency
    if (this.pathServiceFactory) {
      this.pathService = this.pathServiceFactory.createClient() as PathServiceLike;
    }
  }
  
  async readFile(path: string): Promise<string> {
    const resolvedPath = this.resolvePath(path);
    // Implementation...
    return '';
  }
  
  async readFileBuffer(path: string): Promise<Buffer> {
    const resolvedPath = this.resolvePath(path);
    // Implementation...
    return Buffer.from([]);
  }
  
  async fileExists(path: string): Promise<boolean> {
    const resolvedPath = this.resolvePath(path);
    // Implementation...
    return true;
  }
  
  async listFiles(path: string): Promise<string[]> {
    const resolvedPath = this.resolvePath(path);
    // Implementation...
    return [];
  }
  
  private resolvePath(path: string): string {
    // Safely use path service if available, otherwise pass through
    return this.pathService ? this.pathService.resolvePath(path) : path;
  }
}

/**
 * PathService implementation that uses FileSystemLike
 * to avoid circular dependency with FileSystemService
 */
@injectable()
@Service({
  description: 'Service for path operations'
})
export class PathService implements IPathService {
  private fileSystem?: FileSystemLike;
  
  constructor(
    // Using factory pattern with shared types
    @inject(FileSystemServiceClientFactory) private fileSystemFactory?: ClientFactory<IFileSystemServiceClient>
  ) {}
  
  initialize(fileSystemLike?: FileSystemLike, options?: ServiceOptions): void {
    if (fileSystemLike) {
      // Direct initialization if provided
      this.fileSystem = fileSystemLike;
    } else if (this.fileSystemFactory) {
      // Lazy initialization via factory
      this.fileSystem = this.fileSystemFactory.createClient() as FileSystemLike;
    }
  }
  
  async validatePath(path: string): Promise<boolean> {
    const resolvedPath = this.resolvePath(path);
    
    // If we have a file system, check if the file exists
    if (this.fileSystem) {
      return this.fileSystem.fileExists(resolvedPath);
    }
    
    // Otherwise, just return true if the path looks valid
    return !!resolvedPath && resolvedPath.length > 0;
  }
  
  resolvePath(path: string): string {
    // Path resolution logic
    return path;
  }
  
  getDirname(path: string): string {
    // Get directory name logic
    return path.substring(0, path.lastIndexOf('/'));
  }
  
  joinPaths(...paths: string[]): string {
    // Join paths logic
    return paths.join('/');
  }
}