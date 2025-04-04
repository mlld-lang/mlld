import type {
  AbsolutePath,
  RelativePath,
  RawPath,
  StructuredPath
} from '@core/types/paths.js';

/**
 * Minimal interface for what FileSystemService needs from PathService.
 * This interface is used to break the circular dependency between FileSystemService and PathService.
 */
export interface IPathServiceClient {
  /**
   * Resolve a path to its absolute or relative validated form according to Meld's path rules.
   *
   * @param filePath - The path to resolve (RawPath or StructuredPath)
   * @param baseDir - Optional base directory for simple paths (RawPath)
   * @returns The resolved validated path (AbsolutePath or RelativePath)
   */
  resolvePath(filePath: RawPath | StructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath;
  
  /**
   * Normalize a path according to the platform's conventions.
   * 
   * @param path - The path to normalize
   * @returns The normalized path
   */
  normalizePath(path: string): string;
} 