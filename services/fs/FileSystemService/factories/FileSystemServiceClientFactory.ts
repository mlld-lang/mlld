import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IFileSystemService } from '../IFileSystemService.js';
import { IFileSystemServiceClient } from '../interfaces/IFileSystemServiceClient.js';

/**
 * Factory for creating FileSystemServiceClient instances.
 * This factory is used to break the circular dependency between PathService and FileSystemService.
 */
@injectable()
@Service({
  description: 'Factory for creating file system service clients'
})
export class FileSystemServiceClientFactory {
  /**
   * Creates a new FileSystemServiceClientFactory.
   * 
   * @param fileSystemService - The file system service to delegate to
   */
  constructor(@inject('IFileSystemService') private fileSystemService: IFileSystemService) {}
  
  /**
   * Creates a new FileSystemServiceClient that delegates to the FileSystemService.
   * 
   * @returns A client that provides the minimal interface needed by PathService
   */
  createClient(): IFileSystemServiceClient {
    return {
      exists: (path) => this.fileSystemService.exists(path),
      isDirectory: (path) => this.fileSystemService.isDirectory(path)
    };
  }
} 