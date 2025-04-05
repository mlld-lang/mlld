import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { Location } from '@core/types/index.js';
// Import shared types
import { PathServiceBase } from '@core/shared/types.js';
// Remove old StructuredPath import
// import { StructuredPath } from '@core/shared-service-types.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { URLResponse, URLFetchOptions } from '@services/fs/PathService/IURLCache.js';

// Import new path types
import type {
  AbsolutePath,
  RelativePath,
  UrlPath,
  RawPath,
  ValidatedResourcePath, // May use this as a more general validated return type
  StructuredPath, // Import the one from core/types
  PathValidationContext, // Import the new context
  MeldPath
} from '@core/types/paths.js';

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
 * Service responsible for path validation, resolution, and manipulation.
 * Provides standardized path handling and variable substitution.
 * Uses strict, branded path types for input and output where appropriate.
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
   * Resolve a path to its absolute or relative validated form.
   *
   * @param filePath - The path to resolve (RawPath or StructuredPath)
   * @param baseDir - Optional base directory for simple paths (RawPath)
   * @returns The resolved validated path (AbsolutePath or RelativePath)
   * @throws {PathValidationError} If path format is invalid
   */
  resolvePath(filePath: RawPath | StructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath;

  /**
   * Validate a filesystem path according to Meld rules and context.
   *
   * @param filePath - The path to validate (string or MeldPath object).
   * @param context - Context containing validation rules.
   * @returns A promise resolving to the validated MeldPath object.
   * @throws {PathValidationError} If validation fails.
   */
  validatePath(
    filePath: string | MeldPath, // Updated input type
    context: PathValidationContext
  ): Promise<MeldPath>; // Updated return type

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
   * Check if a string potentially represents a URL.
   * Note: Does not validate the URL, just checks format.
   */
  isURL(path: RawPath): boolean;

  /**
   * Validate a URL according to security policy.
   *
   * @param url - The URL string (RawPath) to validate
   * @param options - Validation options
   * @returns A promise resolving to the validated URL (UrlPath)
   * @throws {URLValidationError} If URL is invalid
   * @throws {URLSecurityError} If URL is blocked by security policy
   */
  validateURL(url: RawPath, options?: URLValidationOptions): Promise<UrlPath>;

  /**
   * Fetch content from a URL with caching.
   *
   * @param url - The URL to fetch (must be a validated UrlPath)
   * @param options - Fetch options
   * @returns A promise resolving to the URL response, potentially augmented with validated URL.
   * @throws {URLFetchError} If fetch fails
   * @throws {URLSecurityError} If URL is blocked or response too large
   */
   // Option 1: Return type includes validated URL
   // fetchURL(url: UrlPath, options?: URLFetchOptions): Promise<URLResponse & { validatedUrl: UrlPath }>;
   // Option 2: Keep return simple, assumes input URL is already validated
   fetchURL(url: UrlPath, options?: URLFetchOptions): Promise<URLResponse>; 
}

export type { URLValidationOptions, IPathService }; 