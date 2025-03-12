/**
 * Minimal interface for what FileSystemService needs from PathService.
 * This interface is used to break the circular dependency between FileSystemService and PathService.
 */
export interface IPathServiceClient {
  /**
   * Resolve a path to its absolute form according to Meld's path rules.
   * 
   * @param filePath - The path to resolve
   * @param baseDir - Optional base directory for simple paths
   * @returns The resolved absolute path
   */
  resolvePath(filePath: string, baseDir?: string): string;
  
  /**
   * Normalize a path according to the platform's conventions.
   * 
   * @param path - The path to normalize
   * @returns The normalized path
   */
  normalizePath(path: string): string;
} 