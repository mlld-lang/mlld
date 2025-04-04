import type { IPathService, URLValidationOptions } from '@services/fs/PathService/IPathService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { PathValidationError, PathErrorCode, PathValidationErrorDetails } from '@services/fs/PathService/errors/PathValidationError.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import type { Location } from '@core/types/index.js';
import * as path from 'path';
import * as os from 'os';
import type { MeldNode } from '@core/syntax/types/index.js';
import { 
  MeldError 
} from '@core/errors/MeldError.js';
import { 
  MeldFileNotFoundError 
} from '@core/errors/MeldFileNotFoundError.js';
import { 
  PathErrorMessages 
} from '@core/errors/messages/index.js';
import { Service } from '@core/ServiceProvider.js';
import { injectable, inject } from 'tsyringe';
import { container } from 'tsyringe';
import { pathLogger as logger } from '@core/utils/logger.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import type { URLResponse, URLFetchOptions } from '@services/fs/PathService/IURLCache.js';
import { 
  URLError 
} from '@services/fs/PathService/errors/url/index';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import {
  AbsolutePath,
  RelativePath,
  UrlPath,
  RawPath,
  ValidatedResourcePath,
  StructuredPath,
  PathValidationContext,
  NormalizedAbsoluteDirectoryPath,
  unsafeCreateAbsolutePath,
  unsafeCreateRelativePath,
  unsafeCreateUrlPath,
  isRawPath,
  isAbsolutePath,
  isRelativePath,
  isUrlPath,
  isValidatedResourcePath
} from '@core/types/paths.js';

/**
 * Service for validating and normalizing paths
 */
@injectable()
@Service({
  description: 'Service for validating and normalizing paths according to Meld rules'
})
export class PathService implements IPathService {
  private testMode: boolean = false;
  private homePath: string;
  private projectPath: string;
  private projectPathResolved: boolean = false;
  private fsClient?: IFileSystemServiceClient;
  private fsClientFactory?: FileSystemServiceClientFactory;
  private factoryInitialized: boolean = false;

  /**
   * Creates a new PathService with dependencies injected.
   * 
   * @param projectPathResolver Resolver for project paths
   * @param urlContentResolver Resolver for URL content (optional, used for URL operations)
   */
  constructor(
    @inject(ProjectPathResolver) private readonly projectPathResolver: ProjectPathResolver,
    @inject('IURLContentResolver') private readonly urlContentResolver?: IURLContentResolver
  ) {
    const homeEnv = process.env.HOME || process.env.USERPROFILE;
    if (!homeEnv && !this.testMode) {
      throw new Error('Unable to determine home directory: HOME or USERPROFILE environment variables are not set');
    }
    this.homePath = homeEnv || '';
    this.projectPath = process.cwd();
    
    // Initialize factory if available - REMOVED to avoid circular dependency
    // this.ensureFactoryInitialized();
    
    if (process.env.DEBUG === 'true') {
      console.log('PathService: Initialized with', {
        hasFileSystemClient: !!this.fsClient,
        hasFactory: !!this.fsClientFactory,
        urlContentResolverAvailable: !!this.urlContentResolver,
        testMode: this.testMode
      });
    }
  }

  /**
   * Lazily initialize the FileSystemServiceClient factory
   * This is called only when needed to avoid circular dependencies
   */
  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    // Try to resolve the factory from the container
    try {
      this.fsClientFactory = container.resolve('FileSystemServiceClientFactory');
      this.initializeFileSystemClient();
    } catch (error: unknown) {
      // Factory not available
      logger.debug('FileSystemServiceClientFactory not available');
      // Don't throw an error in test mode
      if (process.env.NODE_ENV !== 'test' && !this.testMode) {
        throw new MeldError('FileSystemServiceClientFactory not available - factory pattern required', { 
          cause: error instanceof Error ? error : new Error(String(error)) 
        });
      }
    }
  }

  /**
   * Initialize the FileSystemServiceClient using the factory
   */
  private initializeFileSystemClient(): void {
    if (!this.fsClientFactory) {
      return;
    }
    
    try {
      this.fsClient = this.fsClientFactory.createClient();
      logger.debug('Successfully created FileSystemServiceClient using factory');
    } catch (error) {
      logger.warn('Failed to create FileSystemServiceClient', { error });
      this.fsClient = undefined;
    }
  }

  /**
   * @deprecated This method is deprecated and will be removed in a future version.
   * Use dependency injection through constructor instead. This is now a no-op method.
   */
  initialize(fileSystem: IFileSystemService, parser: any = null): void {
    logger.warn('PathService.initialize is deprecated and is now a no-op. Use dependency injection instead.');
    // No-op - all services are now injected in the constructor
  }

  /**
   * Set test mode for the path service
   * This enables test-specific behaviors
   */
  setTestMode(enabled: boolean): void {
    this.testMode = enabled;
    
    // In test mode, set default paths for testing
    if (enabled) {
      this.homePath = process.env.HOME || '/home/user';
      // Use current working directory instead of hardcoded test path
      this.projectPath = process.cwd();
    }
  }
  
  /**
   * Alias for setTestMode(true) for backward compatibility
   * @deprecated Use setTestMode(true) instead
   */
  enableTestMode(): void {
    this.setTestMode(true);
  }
  
  /**
   * Disable test mode for path operations.
   * Alias for setTestMode(false) for backward compatibility
   * @deprecated Use setTestMode(false) instead
   */
  disableTestMode(): void {
    this.setTestMode(false);
  }
  
  /**
   * Check if test mode is enabled
   */
  isTestMode(): boolean {
    return this.testMode;
  }
  
  /**
   * Get the home path.
   */
  getHomePath(): string {
    return this.homePath;
  }
  
  /**
   * Get the project path.
   */
  getProjectPath(): string {
    return this.projectPath;
  }
  
  /**
   * Set the project path manually
   * Used in tests to override the default project path
   * @deprecated Use ProjectPathResolver instead
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
    this.projectPathResolved = true;
  }
  
  /**
   * Set the home path manually
   * Used in tests to override the default home path
   * @deprecated Use environment variables instead
   */
  setHomePath(homePath: string): void {
    this.homePath = homePath;
  }

  /**
   * Normalize a path according to Meld path rules
   * - Replace OS home directory with "~"
   * - Normalize slashes to "/"
   * - Resolve "." and ".."
   * - Preserve trailing slash
   */
  normalizePath(pathString: string): string {
    if (!pathString) {
      return '';
    }
    
    const hasTrailingSlash = pathString.endsWith('/') || pathString.endsWith('\\');
    
    // Handle special path variables
    if (pathString.startsWith('$PROJECTPATH')) {
      return this.normalizeProjectPath(pathString);
    }
    
    if (pathString.startsWith('$USERPROFILE')) {
      return this.normalizeUserprofilePath(pathString);
    }
    
    // Normalize to forward slashes
    let normalizedPath = pathString.replace(/\\/g, '/');
    
    // Handle home directory
    if (normalizedPath.startsWith('~/')) {
      normalizedPath = path.join(this.homePath, normalizedPath.substring(2));
    } else if (normalizedPath === '~') {
      normalizedPath = this.homePath;
    }
    
    // Normalize path (resolve dots and handle relative paths)
    try {
      normalizedPath = path.normalize(normalizedPath);
    } catch (error) {
      logger.warn('Error normalizing path:', { path: pathString, error });
      // Return the path as-is if normalization fails
      return pathString;
    }
    
    // Convert to forward slashes
    normalizedPath = normalizedPath.replace(/\\/g, '/');
    
    // Preserve trailing slash if original had one
    if (hasTrailingSlash && !normalizedPath.endsWith('/')) {
      normalizedPath += '/';
    }
    
    return normalizedPath;
  }

  /**
   * Normalize a path that starts with $PROJECTPATH
   */
  private normalizeProjectPath(pathString: string): string {
    // Replace $PROJECTPATH with the actual project path
    const resolved = this.resolveMagicPath(pathString);
    
    // Normalize slashes and resolve dots
    return this.normalizePath(resolved);
  }

  /**
   * Normalize a path that starts with $USERPROFILE
   */
  private normalizeUserprofilePath(pathString: string): string {
    // Replace $USERPROFILE with the actual user profile path
    let resolved = pathString.replace('$USERPROFILE', this.homePath);
    
    // Normalize slashes and resolve dots
    return this.normalizePath(resolved);
  }

  /**
   * Check if a path contains Meld magic variables that need to be resolved
   */
  hasPathVariables(pathString: string): boolean {
    if (!pathString) {
      return false;
    }
    
    return (
      pathString.includes('$PROJECTPATH') ||
      pathString.includes('$USERPROFILE') ||
      pathString.includes('$HOMEPATH') ||
      pathString.includes('~/') ||
      pathString === '~' ||
      pathString.startsWith('$.') ||
      pathString.startsWith('$~')
    );
  }

  /**
   * Check if a path contains dot segments (. or ..)
   */
  private hasDotSegments(pathString: string): boolean {
    if (!pathString) return false;
    
    // Check for path segments that are exactly "." or ".."
    const segments = pathString.split('/');
    return segments.some(segment => segment === '.' || segment === '..');
  }

  /**
   * Resolve a path to its absolute or relative validated form according to Meld's path rules:
   * - Simple paths are resolved relative to baseDir or cwd
   * - $. paths are resolved relative to project root
   * - $~ paths are resolved relative to home directory
   * - **Throws an error for URLs.** Use `validateURL` for URLs.
   *
   * @param filePath The path to resolve (RawPath or StructuredPath)
   * @param baseDir Optional base directory for simple paths (RawPath)
   * @returns The resolved path (AbsolutePath or RelativePath)
   * @throws PathValidationError if path format is invalid or if input is a URL.
   */
  resolvePath(filePath: RawPath | StructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath {
    // Debug logging if enabled
    if (process.env.DEBUG_PATH_VALIDATION === 'true') {
      logger.debug(`[PathService][debug] resolvePath called with:`, {
        filePath,
        baseDir,
        testMode: this.testMode
      });
    }

    const rawInputPath = typeof filePath === 'string' ? filePath : filePath.original;

    if (!rawInputPath) {
      // Return empty RelativePath for empty input.
      return unsafeCreateRelativePath('');
    }

    // **Handle URLs - Throw error, this method is only for filesystem paths**
    if (this.isURL(rawInputPath)) {
      throw new PathValidationError(
        PathErrorMessages.EXPECTED_FILESYSTEM_PATH,
        { code: PathErrorCode.EXPECTED_FILESYSTEM_PATH, path: rawInputPath }
      );
    }

    let resolvedString: string;

    // Handle special path variables first
    if (rawInputPath.startsWith('$~') || rawInputPath.startsWith('$HOMEPATH')) {
      resolvedString = this.resolveHomePath(rawInputPath);
    } else if (rawInputPath.startsWith('$.') || rawInputPath.startsWith('$PROJECTPATH')) {
      resolvedString = this.resolveProjPath(rawInputPath);
    } else if (this.hasPathVariables(rawInputPath)) {
       // Resolve other magic variables like $USERPROFILE (less common)
      resolvedString = this.resolveMagicPath(rawInputPath);
    } else if (baseDir && !path.isAbsolute(rawInputPath)) {
      // If baseDir is provided and path is relative, resolve against baseDir
      // Need to normalize the baseDir first before joining
      const normalizedBaseDir = this.normalizePath(baseDir);
      resolvedString = this.normalizePath(path.join(normalizedBaseDir, rawInputPath));
    } else {
       // Otherwise, just normalize the path (handles relative paths from CWD, absolute paths)
      // Resolve relative paths against the project path if no baseDir provided
      if (!path.isAbsolute(rawInputPath)) {
          resolvedString = this.normalizePath(path.join(this.projectPath, rawInputPath));
      } else {
          resolvedString = this.normalizePath(rawInputPath);
      }
    }

    // Determine if the resolved path is absolute or relative and create branded type
    // path.isAbsolute works reliably after normalization
    if (path.isAbsolute(resolvedString)) {
       return unsafeCreateAbsolutePath(resolvedString);
    } else {
       // This case should be less common now as relative paths are resolved against projectPath
       return unsafeCreateRelativePath(resolvedString);
    }
  }

  /**
   * Resolve a home path ($~ or $HOMEPATH)
   */
  resolveHomePath(pathString: RawPath): string { // Input is RawPath
    if (!pathString) return '';
    
    if (pathString === '$~' || pathString === '$HOMEPATH') {
      return this.homePath;
    }
    
    // Replace $~ with the actual home path
    if (pathString.startsWith('$~/')) {
      return path.join(this.homePath, pathString.substring(3));
    }
    
    if (pathString.startsWith('$HOMEPATH/')) {
      return path.join(this.homePath, pathString.substring(10));
    }
    
    // This case should ideally not be hit if called correctly, but normalize as fallback
    return this.normalizePath(pathString);
  }

  /**
   * Resolve a project path ($. or $PROJECTPATH)
   */
  resolveProjPath(pathString: RawPath): string { // Input is RawPath
    if (!pathString) return '';
    
    if (pathString === '$.' || pathString === '$PROJECTPATH') {
      return this.projectPath;
    }
    
    // Replace $. with the actual project path
    if (pathString.startsWith('$./')) {
      return path.join(this.projectPath, pathString.substring(3));
    }
    
    if (pathString.startsWith('$PROJECTPATH/')) {
      return path.join(this.projectPath, pathString.substring(13));
    }
    
    // This case should ideally not be hit if called correctly, but normalize as fallback
    return this.normalizePath(pathString);
  }

  /**
   * Resolve Meld path variables like $PROJECTPATH, $USERPROFILE
   */
  resolveMagicPath(pathString: RawPath): string { // Input is RawPath
    if (!pathString) {
      return '';
    }
    
    let resolved = pathString as string;
    
    // Replace $PROJECTPATH with the actual project path
    if (resolved.includes('$PROJECTPATH')) {
      if (!this.projectPathResolved) {
        this.projectPath = this.projectPathResolver.getProjectPath();
        this.projectPathResolved = true;
      }
      
      resolved = resolved.replace(/\$PROJECTPATH/g, this.projectPath);
    }
    
    // Replace $USERPROFILE (alternate home directory syntax)
    if (resolved.includes('$USERPROFILE')) {
      resolved = resolved.replace(/\$USERPROFILE/g, this.homePath);
    }
    
    // Replace $HOMEPATH with the home path
    if (resolved.includes('$HOMEPATH')) {
      resolved = resolved.replace(/\$HOMEPATH/g, this.homePath);
    }
    
    // Replace ~ (home directory shorthand)
    if (resolved === '~') {
      resolved = this.homePath;
    } else if (resolved.startsWith('~/')) {
      resolved = path.join(this.homePath, resolved.substring(2));
    }
    
    // Normalize the final result
    return this.normalizePath(resolved);
  }

  /**
   * Get the structured representation of a path
   */
  getStructuredPath(pathString: string): StructuredPath {
    const normalized = this.normalizePath(pathString);
    
    return {
      raw: pathString,
      structured: {
        segments: normalized.split('/').filter(Boolean),
        variables: {
          special: this.extractSpecialVariables(pathString),
          path: []
        },
        cwd: pathString.startsWith('./') || pathString.startsWith('../') || !path.isAbsolute(pathString)
      },
      normalized
    };
  }

  /**
   * Extract special variables from a path string
   */
  private extractSpecialVariables(pathString: string): string[] {
    const variables: string[] = [];
    
    if (pathString.includes('$PROJECTPATH')) {
      variables.push('$PROJECTPATH');
    }
    
    if (pathString.includes('$USERPROFILE')) {
      variables.push('$USERPROFILE');
    }
    
    if (pathString.includes('$HOMEPATH')) {
      variables.push('$HOMEPATH');
    }
    
    if (pathString.startsWith('~') || pathString.includes('~/')) {
      variables.push('~');
    }
    
    if (pathString.startsWith('$.')) {
      variables.push('$.');
    }
    
    if (pathString.startsWith('$~')) {
      variables.push('$~');
    }
    
    return variables;
  }

  /**
   * Validate a filesystem path according to Meld rules and the provided context.
   * Checks for security, existence, and type constraints.
   * Throws an error if the input path is a URL. Use validateURL for URLs.
   *
   * @param filePath - The path to validate (RawPath or StructuredPath).
   * @param context - Context containing validation rules and environment info.
   * @returns A promise resolving to the validated path (AbsolutePath or RelativePath).
   * @throws {PathValidationError} If validation fails or input is a URL.
   */
  async validatePath(
    filePath: RawPath | StructuredPath,
    context: PathValidationContext // Use the new context type
  ): Promise<AbsolutePath | RelativePath> { // Return union of specific types

    const rawInputPath = typeof filePath === 'string' ? filePath : filePath.original;

    // Debug logging
    if (process.env.DEBUG_PATH_VALIDATION === 'true') {
      logger.debug(`[PathService][debug] validatePath called with:`, {
        rawInputPath,
        context,
        testMode: this.testMode
      });
    }

    // 1. Handle empty path
    if (!rawInputPath) {
      throw new PathValidationError(
        PathErrorMessages.EMPTY_PATH,
        { code: PathErrorCode.EMPTY_PATH, path: rawInputPath }
        // location info might be added from context later if needed
      );
    }

    // 2. Ensure it's not a URL - this method is for filesystem paths only
    if (this.isURL(rawInputPath)) {
      throw new PathValidationError(
        PathErrorMessages.EXPECTED_FILESYSTEM_PATH,
        { code: PathErrorCode.EXPECTED_FILESYSTEM_PATH, path: rawInputPath }
      );
    }

    try {
      // 3. Resolve the path (handles variables, normalization, returns branded type)
      // NOTE: resolvePath uses cwd() implicitly if baseDir isn't passed.
      // We rely on context.workingDirectory for validation boundary checks below,
      // but resolvePath itself doesn't use PathValidationContext yet.
      // This might need refinement if resolvePath logic needs workingDirectory.
      const resolvedPath: AbsolutePath | RelativePath = this.resolvePath(filePath); // BaseDir removed, handled by context now

      // 4. Null byte check
      if ((resolvedPath as string).includes('\0')) {
        throw new PathValidationError(
          PathErrorMessages.NULL_BYTE,
          { code: PathErrorCode.NULL_BYTE, path: rawInputPath }
        );
      }

      // 5. Security / Boundary Checks (using context)
      // This logic replaces the old `allowOutsideBaseDir` check
      if (!context.allowExternalPaths && isAbsolutePath(resolvedPath)) {
          // Ensure projectRoot is a string for comparison, fallback to resolved projectPath
          const projectRootDirString = context.projectRoot ? (context.projectRoot as string) : this.projectPath;
          // Ensure allowedRoots are strings for comparison
          const allowedDirStrings = [
              ...(context.allowedRoots ?? []).map(p => p as string),
              projectRootDirString
          ];

          const isWithinAllowedDir = allowedDirStrings.some(allowedDir =>
              (resolvedPath as string).startsWith(allowedDir)
          );

          if (!isWithinAllowedDir) {
              throw new PathValidationError(
                  PathErrorMessages.OUTSIDE_PROJECT_ROOT, // Or a more general "Outside Allowed Roots" message
                  {
                      code: PathErrorCode.OUTSIDE_PROJECT_ROOT, // Or OUTSIDE_ALLOWED_ROOTS
                      path: rawInputPath,
                      resolvedPath: resolvedPath,
                      allowedRoots: allowedDirStrings // Use the string array for details
                  }
              );
          }
      }
      // TODO: Implement checks for allowAbsolute, allowRelative, allowParentTraversal from context.rules if needed
      // TODO: Implement checks for maxLength, allowedPrefixes, disallowedPrefixes, pattern from context.rules


      // 6. Existence and Type Checks (using context.rules and fsClient)
      if (context.rules.mustExist || context.rules.mustBeFile || context.rules.mustBeDirectory) {
        // Ensure fsClient is available
        this.ensureFactoryInitialized(); // Make sure client/factory is initialized
        if (!this.fsClient) {
           // Cannot perform check if fsClient isn't available
           const errorMsg = 'Cannot check path existence/type: FileSystemServiceClient is not available.';
           logger.error(errorMsg, { path: rawInputPath, resolvedPath });
           // Throw a more specific internal error? Or PathValidationError?
           throw new PathValidationError(errorMsg, {
               code: PathErrorCode.INTERNAL_ERROR, // Or a new code like FS_UNAVAILABLE
               path: rawInputPath,
               resolvedPath: resolvedPath
           });
        }

        const exists = await this.fsClient.exists(resolvedPath as string); // Cast branded type to string for client

        if (context.rules.mustExist && !exists) {
          throw new PathValidationError(
            PathErrorMessages.FILE_NOT_FOUND,
            { code: PathErrorCode.FILE_NOT_FOUND, path: rawInputPath, resolvedPath: resolvedPath }
          );
        }

        // Only check type if it exists (or if mustExist wasn't true but type check is)
        if (exists && (context.rules.mustBeFile || context.rules.mustBeDirectory)) {
           const isDirectory = await this.fsClient.isDirectory(resolvedPath as string); // Cast branded type

           if (context.rules.mustBeFile && isDirectory) {
               throw new PathValidationError(
                   PathErrorMessages.NOT_A_FILE,
                   { code: PathErrorCode.NOT_A_FILE, path: rawInputPath, resolvedPath: resolvedPath }
               );
           }

           if (context.rules.mustBeDirectory && !isDirectory) {
               throw new PathValidationError(
                   PathErrorMessages.NOT_A_DIRECTORY,
                   { code: PathErrorCode.NOT_A_DIRECTORY, path: rawInputPath, resolvedPath: resolvedPath }
               );
           }
        }
      }

      // 7. Path is valid, return the resolved (and already branded) path
      return resolvedPath;

    } catch (error) {
      // Re-throw known PathValidationErrors, wrap others
      if (error instanceof PathValidationError) {
        throw error;
      }
      if (error instanceof MeldError) {
         // Could potentially wrap MeldError as well if needed
         throw error;
      }

      // Wrap unexpected errors
      const details: PathValidationErrorDetails = {
        code: PathErrorCode.INVALID_PATH, // Generic code for unexpected issues
        path: rawInputPath,
        cause: error instanceof Error ? error : new Error(String(error))
      };
      // Add resolvedPath to details if available
      // We need to capture resolvedPath before potential errors in section 6
      // Let's define it outside the try block or handle this differently.
      // For now, we omit resolvedPath from generic error details.

      throw new PathValidationError(
        `Validation failed for path "${rawInputPath}": ${(error as Error).message}`,
        details
        // location can be added from context later
      );
    }
  }

  /**
   * Validate a Meld path with location information
   * This is a convenience method for tests
   */
  validateMeldPath(pathString: string, location?: Location): void {
    // Skip validation in test mode
    if (this.testMode) {
      return;
    }
    
    // No longer reject paths with dot segments
    // No longer reject raw absolute paths 
    // No longer reject paths with slashes but no path variable
    
    // Only perform basic path safety checks like null byte detection
    if (pathString.includes('\0')) {
      throw new PathValidationError(
        PathErrorMessages.NULL_BYTE,
        {
          code: PathErrorCode.NULL_BYTE,
          path: pathString
        },
        location
      );
    }
  }

  /**
   * Checks if a path exists
   * @param filePath - The path to check
   * @returns True if the path exists, false otherwise
   */
  async exists(filePath: string): Promise<boolean> {
    // Ensure factory is initialized - only when needed
    this.ensureFactoryInitialized();
    
    // Try to use the filesystem client
    if (this.fsClient) {
      try {
        return await this.fsClient.exists(filePath);
      } catch (error) {
        logger.warn('Error using fsClient.exists', { 
          error, 
          path: filePath 
        });
      }
    }
    
    // Last resort fallback - assume path exists
    logger.warn('No filesystem service available, assuming path exists', { path: filePath });
    return true;
  }

  /**
   * Checks if a path is a directory
   * @param dirPath - The path to check
   * @returns True if the path is a directory, false otherwise
   */
  async isDirectory(dirPath: string): Promise<boolean> {
    // Ensure factory is initialized - only when needed
    this.ensureFactoryInitialized();
    
    // Try to use the filesystem client
    if (this.fsClient) {
      try {
        return await this.fsClient.isDirectory(dirPath);
      } catch (error) {
        logger.warn('Error using fsClient.isDirectory', { 
          error, 
          path: dirPath 
        });
      }
    }
    
    // Last resort fallback - assume path is not a directory
    logger.warn('No filesystem service available, assuming path is not a directory', { path: dirPath });
    return false;
  }

  /**
   * Get the location object for a path
   * This is used for error reporting with source locations
   */
  getPathLocation(targetPath: string): Location {
    return {
      start: { line: 1, column: 1 },
      end: { line: 1, column: targetPath.length },
      filePath: targetPath
    };
  }
  
  /**
   * Resolve the project path using auto-detection or configuration.
   * This method will:
   * 1. Look for meld.json and use its projectRoot setting if valid
   * 2. Auto-detect using common project markers
   * 3. Fall back to current directory
   */
  async resolveProjectPath(): Promise<string> {
    // If projectPath is already resolved, return it
    if (this.projectPathResolved) {
      return this.projectPath;
    }
    
    // Otherwise, use the ProjectPathResolver to get the project path
    this.projectPath = this.projectPathResolver.getProjectPath();
    this.projectPathResolved = true;
    
    return this.projectPath;
  }
  
  /**
   * Join multiple path segments together.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   * 
   * @param paths The path segments to join
   * @returns The joined path
   */
  joinPaths(...paths: string[]): string {
    return path.join(...paths);
  }
  
  /**
   * Get the directory name of a path.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   * 
   * @param filePath The path to get the directory from
   * @returns The directory name
   */
  dirname(filePath: string): string {
    return path.dirname(filePath);
  }
  
  /**
   * Get the base name of a path.
   * Note: This is a low-level utility and does not enforce Meld path rules.
   * 
   * @param filePath The path to get the base name from
   * @returns The base name
   */
  basename(filePath: string): string {
    return path.basename(filePath);
  }

  /**
   * Check if a string potentially represents a URL.
   * Note: Does not validate the URL, just checks format.
   */
  isURL(path: RawPath): boolean { // Accept RawPath
    if (!path || typeof path !== 'string') {
      return false;
    }
    // Basic check for common URL schemes
    return /^https?:\/\//i.test(path);
  }

  /**
   * Validate a URL according to security policy.
   *
   * @param url - The URL string (RawPath) to validate
   * @param options - Validation options
   * @returns A promise resolving to the validated URL (UrlPath)
   * @throws {URLValidationError} If URL is invalid
   * @throws {URLSecurityError} If URL is blocked by security policy
   */
  async validateURL(url: RawPath, options?: URLValidationOptions): Promise<UrlPath> { // Return UrlPath
    if (!this.urlContentResolver) {
      const msg = 'URL validation requires IURLContentResolver, but it was not provided.';
      logger.error(msg);
      throw new URLError(msg);
    }
    
    try {
      // Delegate actual validation to URLContentResolver
      const validatedUrlString = await this.urlContentResolver.validateURL(url as string, options);
      // If validation succeeds, create and return the branded type
      return unsafeCreateUrlPath(validatedUrlString);
    } catch (error) {
      // Re-throw URL errors directly
      if (error instanceof URLError) {
        throw error;
      }
      // Wrap other errors
      throw new URLError(`URL validation failed: ${(error as Error).message}`, { cause: error });
    }
  }

  /**
   * Fetch content from a URL with caching.
   * 
   * @param url - The URL to fetch (must be a validated UrlPath)
   * @param options - Fetch options
   * @returns A promise resolving to the URL response with content and metadata.
   * @throws {URLFetchError} If fetch fails
   * @throws {URLSecurityError} If URL is blocked or response too large
   */
  async fetchURL(url: UrlPath, options?: URLFetchOptions): Promise<URLResponse> { // Input is UrlPath
    if (!this.urlContentResolver) {
      const msg = 'URL fetching requires IURLContentResolver, but it was not provided.';
      logger.error(msg);
      throw new URLError(msg); // Use URLError or a more specific FetchError?
    }

    try {
      // Delegate fetching to URLContentResolver, casting UrlPath back to string
      return await this.urlContentResolver.fetchURL(url as string, options);
    } catch (error) {
      // Re-throw URL errors directly
      if (error instanceof URLError) {
        throw error;
      }
      // Wrap other errors
      throw new URLError(`URL fetch failed for "${url}": ${(error as Error).message}`, { cause: error });
    }
  }
}