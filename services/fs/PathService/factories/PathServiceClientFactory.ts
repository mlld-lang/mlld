import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient';
// Import needed types for the signature
import type {
  AbsolutePath,
  RelativePath,
  RawPath,
  StructuredPath
} from '@core/types/paths';

/**
 * Factory for creating PathServiceClient instances.
 * This factory is used to break the circular dependency between FileSystemService and PathService.
 */
@injectable()
@Service({
  description: 'Factory for creating path service clients'
})
export class PathServiceClientFactory {
  /**
   * Creates a new PathServiceClientFactory.
   * 
   * @param pathService - The path service to delegate to
   */
  constructor(@inject('IPathService') private pathService: IPathService) {}
  
  /**
   * Creates a new PathServiceClient that delegates to the PathService.
   * 
   * @returns A client that provides the minimal interface needed by FileSystemService
   */
  createClient(): IPathServiceClient {
    return {
      resolvePath: (filePath: RawPath | StructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath => {
        return this.pathService.resolvePath(filePath, baseDir);
      },
      normalizePath: (path: string): string => {
        if (this.pathService.normalizePath) {
          return this.pathService.normalizePath(path);
        }
        // Fallback implementation if not available
        return path;
      }
    };
  }
} 