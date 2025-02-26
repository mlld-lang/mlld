import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { Location } from '@core/types/index.js';
// Define StructuredPath locally instead of importing
// import type { StructuredPath } from 'meld-spec';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';

// Use a local interface that matches the expected structure
export interface StructuredPath {
  raw: string;
  structured: {
    segments: string[];
    variables?: {
      special?: string[];
      path?: string[];
    };
    cwd?: boolean;
  };
  normalized?: string;
}

/**
 * Options for path validation and operations
 */
export interface PathOptions {
  /**
   * Base directory to resolve relative paths against.
   * For paths without slashes, this is used as the base directory.
   * For paths with $. or $~, this is ignored.
   */
  baseDir?: string;

  /**
   * Whether to allow paths outside the base directory.
   * If false, paths must be within the base directory.
   * Default is true.
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
 * Service for validating and normalizing paths according to Meld's strict rules:
 * 
 * 1. Simple paths (no slashes):
 *    - Allowed only when path contains no slashes
 *    - Example: file.meld
 * 
 * 2. Paths with slashes:
 *    - Must start with $. (alias for $PROJECTPATH) or $~ (alias for $HOMEPATH)
 *    - Example: $./path/to/file.meld or $~/path/to/file.meld
 * 
 * 3. Forbidden:
 *    - Parent directory references (..)
 *    - Current directory references (.)
 *    - Raw absolute paths
 *    - Paths with slashes not using $. or $~
 */
export interface IPathService {
  /**
   * Initialize the path service with a file system service.
   * Optionally initialize with a parser service for AST-based path handling.
   * Must be called before using any other methods.
   */
  initialize(fileSystem: IFileSystemService, parser?: IParserService): void;

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
   * Set the home path for testing.
   */
  setHomePath(path: string): void;

  /**
   * Set the project path for testing.
   */
  setProjectPath(path: string): void;

  /**
   * Get the home path.
   */
  getHomePath(): string;

  /**
   * Get the project path.
   */
  getProjectPath(): string;

  /**
   * Resolve the project path using auto-detection or configuration.
   * This method will:
   * 1. Look for meld.json and use its projectRoot setting if valid
   * 2. Auto-detect using common project markers
   * 3. Fall back to current directory
   */
  resolveProjectPath(): Promise<string>;

  /**
   * Resolve a path to its absolute form according to Meld's path rules:
   * - Simple paths are resolved relative to baseDir or cwd
   * - $. paths are resolved relative to project root
   * - $~ paths are resolved relative to home directory
   * 
   * @param filePath The path to resolve (string or StructuredPath)
   * @param baseDir Optional base directory for simple paths
   * @returns The resolved absolute path
   * @throws PathValidationError if path format is invalid
   */
  resolvePath(filePath: string | StructuredPath, baseDir?: string): string;

  /**
   * Validate a path according to Meld's rules and the specified options.
   * 
   * @param filePath The path to validate (string or StructuredPath)
   * @param options Options for validation
   * @throws PathValidationError if validation fails
   */
  validatePath(filePath: string | StructuredPath, options?: PathOptions): Promise<string>;

  /**
   * Join multiple path segments together.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   * 
   * @param paths The path segments to join
   * @returns The joined path
   */
  join(...paths: string[]): string;

  /**
   * Get the directory name of a path.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   * 
   * @param filePath The path to get the directory from
   * @returns The directory name
   */
  dirname(filePath: string): string;

  /**
   * Get the base name of a path.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   * 
   * @param filePath The path to get the base name from
   * @returns The base name
   */
  basename(filePath: string): string;
} 