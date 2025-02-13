import type { IFileSystemService } from '../FileSystemService/IFileSystemService';

export interface PathOptions {
  /**
   * The base directory to resolve relative paths from
   */
  baseDir?: string;
  
  /**
   * Whether to allow paths outside the base directory
   * @default false
   */
  allowOutsideBaseDir?: boolean;
  
  /**
   * Whether to require the path to exist
   * @default true
   */
  mustExist?: boolean;
  
  /**
   * Whether the path must be a directory
   * @default false
   */
  mustBeDirectory?: boolean;
  
  /**
   * Whether the path must be a file
   * @default false
   */
  mustBeFile?: boolean;
}

export interface IPathService {
  /**
   * Initialize the PathService with required dependencies
   */
  initialize(fileSystem: IFileSystemService): void;
  
  /**
   * Resolve and validate a path according to the given options
   * Path variables will already be interpolated by meld-ast
   * @throws {PathValidationError} If the path is invalid or doesn't meet the requirements
   */
  resolvePath(path: string, options?: PathOptions): Promise<string>;
  
  /**
   * Resolve multiple paths according to the given options
   * @throws {PathValidationError} If any path is invalid or doesn't meet the requirements
   */
  resolvePaths(paths: string[], options?: PathOptions): Promise<string[]>;
  
  /**
   * Check if a path is valid according to the given options
   * Returns true if valid, false otherwise
   */
  isValidPath(path: string, options?: PathOptions): Promise<boolean>;
} 