import type { ValidatedResourcePath } from '@core/types/paths';

/**
 * Minimal interface for what PathService needs from FileSystemService.
 * This interface is used to break the circular dependency between PathService and FileSystemService.
 */
export interface IFileSystemServiceClient {
  /**
   * Checks if a file or directory exists.
   * 
   * @param filePath - Validated path to check
   * @returns A promise that resolves with true if the path exists, false otherwise
   */
  exists(filePath: ValidatedResourcePath): Promise<boolean>;
  
  /**
   * Checks if a path points to a directory.
   * 
   * @param filePath - Validated path to check
   * @returns A promise that resolves with true if the path is a directory, false otherwise
   */
  isDirectory(filePath: ValidatedResourcePath): Promise<boolean>;
} 