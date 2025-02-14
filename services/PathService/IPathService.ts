import { IFileSystemService } from '../FileSystemService/IFileSystemService';
import type { Location } from '../../core/types';

/**
 * Options for path validation and operations
 */
export interface PathOptions {
  /**
   * Base directory to resolve relative paths against.
   * If provided, paths will be validated to ensure they are within this directory
   * unless allowOutsideBaseDir is true.
   */
  baseDir?: string;

  /**
   * Whether to allow paths that resolve outside the base directory.
   * Only applicable if baseDir is provided.
   * @default false
   */
  allowOutsideBaseDir?: boolean;

  /**
   * Whether the path must exist on disk.
   * @default true
   */
  mustExist?: boolean;

  /**
   * Whether the path must be a file (not a directory).
   * Only checked if mustExist is true.
   * @default false
   */
  mustBeFile?: boolean;

  /**
   * Whether the path must be a directory (not a file).
   * Only checked if mustExist is true.
   * @default false
   */
  mustBeDirectory?: boolean;

  location?: Location;
}

/**
 * Service for validating and normalizing paths.
 * Does not handle path variable resolution - that is handled by ResolutionService.
 */
export interface IPathService {
  /**
   * Initialize the path service with a file system service.
   * Must be called before using any other methods.
   */
  initialize(fileSystem: IFileSystemService): void;

  /**
   * Enable test mode for path operations.
   * In test mode, certain validations may be relaxed or mocked.
   */
  enableTestMode(): void;

  /**
   * Disable test mode for path operations.
   */
  disableTestMode(): void;

  /**
   * Check if test mode is enabled.
   */
  isTestMode(): boolean;

  /**
   * Resolve a path to its absolute form.
   * This includes resolving '..' and '.' segments.
   * 
   * @param filePath The path to resolve
   * @param baseDir Optional base directory to resolve relative paths against
   * @returns The resolved absolute path
   */
  resolvePath(filePath: string, baseDir?: string): string;

  /**
   * Validate a path according to the specified options.
   * The path should already have any variables resolved by ResolutionService.
   * 
   * @param filePath The path to validate
   * @param options Options for validation
   * @throws PathValidationError if validation fails
   */
  validatePath(filePath: string, options?: PathOptions): Promise<string>;

  /**
   * Normalize a path by resolving '..' and '.' segments.
   * Does not resolve variables or make the path absolute.
   * 
   * @param filePath The path to normalize
   * @returns The normalized path
   */
  normalizePath(filePath: string): string;

  /**
   * Join multiple path segments together.
   * 
   * @param paths The path segments to join
   * @returns The joined path
   */
  join(...paths: string[]): string;

  /**
   * Get the directory name of a path.
   * 
   * @param filePath The path to get the directory from
   * @returns The directory name
   */
  dirname(filePath: string): string;

  /**
   * Get the base name of a path.
   * 
   * @param filePath The path to get the base name from
   * @returns The base name
   */
  basename(filePath: string): string;
} 