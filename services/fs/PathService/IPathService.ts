import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { Location } from '@core/types/index.js';
// Import shared types
import { PathServiceBase } from '@core/shared/types.js';
import { StructuredPath } from '@core/shared-service-types.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { URLResponse, URLFetchOptions } from '@services/fs/PathService/IURLCache.js';

/**
 * Options for URL validation and operations
 */
interface URLValidationOptions {
  /**
   * Allowed protocols
   * @default ['http', 'https']
   */
  allowedProtocols?: string[];
  
  /**
   * Domain allowlist (if empty, all domains allowed unless blocklisted)
   */
  allowedDomains?: string[];
  
  /**
   * Domain blocklist (overrides allowlist)
   */
  blockedDomains?: string[];
  
  /**
   * Maximum response size in bytes
   * @default 5MB
   */
  maxResponseSize?: number;
  
  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
}

/**
 * Options for path validation and operations
 */
interface PathOptions {
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
   * Whether to allow URLs for this path
   * @default false
   */
  allowURLs?: boolean;

  /**
   * Options for URL validation and fetching
   */
  urlOptions?: URLValidationOptions;

  /**
   * Source location information for error reporting.
   */
  location?: Location;
}

/**
 * Service responsible for path validation, resolution, and manipulation.
 * Provides standardized path handling and variable substitution.
 * 
 * @remarks
 * The PathService provides path resolution and standardized path manipulation utilities.
 * It supports path variables for cross-platform portability while allowing standard path formats.
 * 
 * Meld supports the following path formats:
 * 1. Simple paths (no slashes):
 *    - Example: file.mld
 * 
 * 2. Relative paths:
 *    - Example: path/to/file.mld
 *    - Example: ./path/to/file.mld
 *    - Example: ../path/to/file.mld
 * 
 * 3. Absolute paths:
 *    - Example: /absolute/path/to/file.mld
 * 
 * 4. Path variables (for cross-platform portability):
 *    - $. or $PROJECTPATH: Project root directory
 *      Example: $./path/to/file.mld
 *    - $~ or $HOMEPATH: User's home directory
 *      Example: $~/path/to/file.mld
 * 
 * Dependencies:
 * - IFileSystemService: For file and directory existence checks
 * - IParserService: Optional, for AST-based path handling
 */
interface IPathService extends PathServiceBase {
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
   * - URL paths are returned as-is if allowURLs is true
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
  joinPaths(...paths: string[]): string;

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

  /**
   * Check if a string is a URL.
   * 
   * @param path - String to check
   * @returns True if the string is a valid URL
   * 
   * @example
   * ```ts
   * // Check if a path is a URL
   * if (pathService.isURL("https://example.com/data.json")) {
   *   console.log("This is a URL");
   * }
   * ```
   */
  isURL(path: string): boolean;

  /**
   * Validate a URL according to security policy.
   * 
   * @param url - The URL to validate
   * @param options - Validation options
   * @returns The validated URL
   * @throws {URLValidationError} If URL is invalid
   * @throws {URLSecurityError} If URL is blocked by security policy
   * 
   * @example
   * ```ts
   * try {
   *   const validatedUrl = await pathService.validateURL("https://example.com/data.json", {
   *     allowedDomains: ["example.com"]
   *   });
   *   console.log(`Valid URL: ${validatedUrl}`);
   * } catch (error) {
   *   console.error(`Invalid URL: ${error.message}`);
   * }
   * ```
   */
  validateURL(url: string, options?: URLValidationOptions): Promise<string>;

  /**
   * Fetch content from a URL with caching.
   * 
   * @param url - The URL to fetch
   * @param options - Fetch options
   * @returns The URL response with content and metadata
   * @throws {URLFetchError} If fetch fails
   * @throws {URLSecurityError} If URL is blocked or response too large
   * 
   * @example
   * ```ts
   * try {
   *   const response = await pathService.fetchURL("https://example.com/data.json");
   *   console.log(`Fetched ${response.url} (${response.fromCache ? 'from cache' : 'from network'})`);
   *   console.log(`Content: ${response.content.substring(0, 100)}...`);
   * } catch (error) {
   *   console.error(`Failed to fetch URL: ${error.message}`);
   * }
   * ```
   */
  fetchURL(url: string, options?: URLFetchOptions): Promise<URLResponse>;
}

export type { PathOptions, URLValidationOptions, IPathService }; 