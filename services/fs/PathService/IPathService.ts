import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { Location } from '@core/types/index.js';
// Define StructuredPath locally instead of importing
// import type { StructuredPath } from 'meld-spec';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';

/**
 * Represents a structured path with raw, parsed, and normalized representations.
 * Used for advanced path handling and security enforcement.
 */
export interface StructuredPath {
  /** The original raw path string */
  raw: string;
  /** Parsed structure of the path */
  structured: {
    /** Path segments split by separators */
    segments: string[];
    /** Variables found in the path */
    variables?: {
      /** Special variables like $PROJECTPATH, $HOMEPATH */
      special?: string[];
      /** Path variables defined with @path directives */
      path?: string[];
    };
    /** Whether the path is relative to current working directory */
    cwd?: boolean;
  };
  /** Path in normalized form (typically absolute) */
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

  /**
   * Source location information for error reporting.
   */
  location?: Location;
}

/**
 * Service responsible for path validation, resolution, and manipulation.
 * Enforces security constraints and provides standardized path handling.
 * 
 * @remarks
 * The PathService is one of the core security services in Meld. It enforces strict
 * path validation rules to prevent directory traversal and unauthorized filesystem access.
 * It provides path resolution within a constrained set of allowed locations (project directory,
 * home directory) and standardized path manipulation utilities.
 * 
 * Meld enforces the following path rules:
 * 1. Simple paths (no slashes):
 *    - Allowed only when path contains no slashes
 *    - Example: file.mld
 * 
 * 2. Paths with slashes:
 *    - Must start with $. (alias for $PROJECTPATH) or $~ (alias for $HOMEPATH)
 *    - Example: $./path/to/file.mld or $~/path/to/file.mld
 * 
 * 3. Forbidden:
 *    - Parent directory references (..)
 *    - Current directory references (.)
 *    - Raw absolute paths
 *    - Paths with slashes not using $. or $~
 * 
 * Dependencies:
 * - IFileSystemService: For file and directory existence checks
 * - IParserService: Optional, for AST-based path handling
 */
export interface IPathService {
  /**
   * Initialize the path service with required dependencies.
   * Must be called before using any other methods.
   * 
   * @param fileSystem - The file system service for file operations
   * @param parser - Optional parser service for AST-based path handling
   */
  initialize(fileSystem: IFileSystemService, parser?: IParserService): void;

  /**
   * Enable test mode for path operations.
   * In test mode, certain validations may be relaxed or mocked.
   */
  enableTestMode(): void;

  /**
   * Disable test mode for path operations.
   * Returns to normal validation mode.
   */
  disableTestMode(): void;

  /**
   * Check if test mode is enabled.
   * 
   * @returns true if test mode is enabled, false otherwise
   */
  isTestMode(): boolean;

  /**
   * Set the home path for testing.
   * Allows overriding the system home path in test environments.
   * 
   * @param path - The path to use as home path
   */
  setHomePath(path: string): void;

  /**
   * Set the project path for testing.
   * Allows overriding the project path in test environments.
   * 
   * @param path - The path to use as project path
   */
  setProjectPath(path: string): void;

  /**
   * Get the current home path.
   * 
   * @returns The configured or system home path
   */
  getHomePath(): string;

  /**
   * Get the current project path.
   * 
   * @returns The configured project path
   */
  getProjectPath(): string;

  /**
   * Resolve the project path using auto-detection or configuration.
   * 
   * @returns A promise that resolves to the detected project path
   * @throws {MeldPathError} If project path cannot be resolved
   * 
   * @remarks
   * This method will:
   * 1. Look for meld.json and use its projectRoot setting if valid
   * 2. Auto-detect using common project markers (.git, package.json, etc.)
   * 3. Fall back to current directory
   * 
   * @example
   * ```ts
   * // Auto-detect the project path
   * const projectPath = await pathService.resolveProjectPath();
   * console.log(`Project root detected at: ${projectPath}`);
   * ```
   */
  resolveProjectPath(): Promise<string>;

  /**
   * Resolve a path to its absolute form according to Meld's path rules.
   * 
   * @param filePath - The path to resolve (string or StructuredPath)
   * @param baseDir - Optional base directory for simple paths
   * @returns The resolved absolute path
   * @throws {PathValidationError} If path format is invalid
   * 
   * @remarks
   * - Simple paths are resolved relative to baseDir or cwd
   * - $. paths are resolved relative to project root
   * - $~ paths are resolved relative to home directory
   * 
   * @example
   * ```ts
   * // Resolve a path relative to the project root
   * const absPath = pathService.resolvePath("$./src/config.json");
   * 
   * // Resolve a simple filename relative to a specific directory
   * const configPath = pathService.resolvePath("config.json", "/path/to/configs");
   * ```
   */
  resolvePath(filePath: string | StructuredPath, baseDir?: string): string;

  /**
   * Validate a path according to Meld's rules and the specified options.
   * 
   * @param filePath - The path to validate (string or StructuredPath)
   * @param options - Options for validation
   * @returns The validated and resolved absolute path
   * @throws {PathValidationError} If validation fails
   * 
   * @example
   * ```ts
   * try {
   *   // Validate that a path exists and is a file
   *   const validPath = await pathService.validatePath("$./config.json", {
   *     mustExist: true,
   *     mustBeFile: true
   *   });
   *   console.log(`Valid path: ${validPath}`);
   * } catch (error) {
   *   console.error(`Invalid path: ${error.message}`);
   * }
   * ```
   */
  validatePath(filePath: string | StructuredPath, options?: PathOptions): Promise<string>;

  /**
   * Join multiple path segments together.
   * 
   * @param paths - The path segments to join
   * @returns The joined path
   * 
   * @remarks
   * This is a low-level utility and does not enforce Meld path rules.
   * It's primarily used for internal path manipulation.
   */
  join(...paths: string[]): string;

  /**
   * Get the directory name of a path.
   * 
   * @param filePath - The path to get the directory from
   * @returns The directory name
   * 
   * @remarks
   * This is a low-level utility and does not enforce Meld path rules.
   */
  dirname(filePath: string): string;

  /**
   * Get the base name of a path.
   * 
   * @param filePath - The path to get the base name from
   * @returns The base name
   * 
   * @remarks
   * This is a low-level utility and does not enforce Meld path rules.
   */
  basename(filePath: string): string;
  
  /**
   * Normalize a path, resolving '..' and '.' segments.
   * 
   * @param filePath - The path to normalize
   * @returns The normalized path
   * 
   * @remarks
   * This is a low-level utility and does not enforce Meld path rules.
   * It's primarily used for internal path manipulation.
   */
  normalizePath?(filePath: string): string;
} 