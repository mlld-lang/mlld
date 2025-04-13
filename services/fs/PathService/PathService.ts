import type { IPathService, URLValidationOptions } from '@services/fs/PathService/IPathService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { PathValidationError, PathErrorCode, PathValidationErrorDetails } from '@services/fs/PathService/errors/PathValidationError';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import type { Location } from '@core/types';
import * as path from 'path';
import * as os from 'os';
import type { MeldNode } from '@core/syntax/types/index';
import { 
  MeldError 
} from '@core/errors/MeldError';
import { 
  MeldFileNotFoundError 
} from '@core/errors/MeldFileNotFoundError';
import { 
  PathErrorMessages 
} from '@core/errors/messages/index';
import { Service } from '@core/ServiceProvider';
import { injectable, inject } from 'tsyringe';
import { container } from 'tsyringe';
import { pathLogger as logger } from '@core/utils/logger';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory';
import type { URLResponse, URLFetchOptions } from '@services/fs/PathService/IURLCache';
import { 
  URLError 
} from '@services/fs/PathService/errors/url/index';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver';
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
  isValidatedResourcePath,
  PathContentType,
  type MeldPath,
  type AnyPath,
  type MeldResolvedFilesystemPath,
  createRawPath
} from '@core/types/paths';
import { ErrorSeverity } from '@core/errors/index';
import type { Position } from '@core/types/location';
import type { IFileSystemClient } from '@services/fs/FileSystemService/interfaces/IFileSystemClient';

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
          code: 'FACTORY_NOT_AVAILABLE',
          severity: ErrorSeverity.Fatal,
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
    const resolved = pathString.replace('$USERPROFILE', this.homePath);
    
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
   * Resolves a path to an absolute or relative validated form according to Meld's path rules:
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
    if (this.isURL(createRawPath(rawInputPath))) {
      throw new PathValidationError(
        PathErrorMessages.EXPECTED_FILESYSTEM_PATH,
        {
          code: PathErrorCode.E_PATH_EXPECTED_FS,
          severity: ErrorSeverity.Fatal,
          path: rawInputPath
        }
      );
    }

    let resolvedString: string;

    // Handle special path variables first
    if (rawInputPath.startsWith('$~') || rawInputPath.startsWith('$HOMEPATH')) {
      resolvedString = this.resolveHomePath(createRawPath(rawInputPath));
    } else if (rawInputPath.startsWith('$.') || rawInputPath.startsWith('$PROJECTPATH')) {
      resolvedString = this.resolveProjPath(createRawPath(rawInputPath));
    } else if (this.hasPathVariables(rawInputPath)) {
       // Resolve other magic variables like $USERPROFILE (less common)
      resolvedString = this.resolveMagicPath(createRawPath(rawInputPath));
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
  resolveHomePath(pathString: RawPath): string {
    const home = this.getHomePath();
    let relPath: string;
    if (pathString === '$HOMEPATH') {
      relPath = '';
    } else {
      // Use substring based on the prefix length
      const prefix = pathString.startsWith('$HOMEPATH') ? '$HOMEPATH' : '$~';
      relPath = pathString.substring(prefix.length);
      // Remove leading separator if present
      if (relPath.startsWith('/') || relPath.startsWith('\\')) {
        relPath = relPath.substring(1);
      }
    }
    // Join with platform specific separator, then normalize
    return this.normalizePath(path.join(home, relPath));
  }

  /**
   * Resolve a project path ($. or $PROJECTPATH)
   */
  resolveProjPath(pathString: RawPath): string {
    let relPath: string;
    if (pathString === '$PROJECTPATH') {
      relPath = '';
    } else {
      // Use substring based on the prefix length
      const prefix = pathString.startsWith('$PROJECTPATH') ? '$PROJECTPATH' : '$.';
      relPath = pathString.substring(prefix.length);
      // Remove leading separator if present
      if (relPath.startsWith('/') || relPath.startsWith('\\')) {
        relPath = relPath.substring(1);
      }
    }
    // Join with platform specific separator, then normalize
    return this.normalizePath(path.join(this.projectPath, relPath));
  }

  /**
   * Resolve Meld path variables like $PROJECTPATH, $USERPROFILE
   */
  resolveMagicPath(pathString: RawPath): string {
    // Handle HOMEPATH/USERPROFILE variations
    if (pathString.startsWith('$HOMEPATH') || pathString.startsWith('$USERPROFILE')) {
      const home = this.getHomePath();
      const prefix = pathString.startsWith('$HOMEPATH') ? '$HOMEPATH' : '$USERPROFILE';
      const relPath = pathString.substring(prefix.length);
      return this.normalizePath(path.join(home, relPath.startsWith('/') || relPath.startsWith('\\') ? relPath.substring(1) : relPath));
    }
    // Handle PROJECTPATH variations
    if (pathString.startsWith('$PROJECTPATH')) {
      const proj = this.projectPath;
      const relPath = pathString.substring('$PROJECTPATH'.length);
      return this.normalizePath(path.join(proj, relPath.startsWith('/') || relPath.startsWith('\\') ? relPath.substring(1) : relPath));
    }
    // Handle tilde variations
    if (pathString === '~' || pathString.startsWith('~/')) {
      const home = this.getHomePath();
      const relPath = pathString.startsWith('~/') ? pathString.substring(1) : '';
      return this.normalizePath(path.join(home, relPath.startsWith('/') || relPath.startsWith('\\') ? relPath.substring(1) : relPath));
    }
    // Handle dollar-dot variations
    if (pathString.startsWith('$.')) {
      const proj = this.projectPath;
      const relPath = pathString.substring(1);
      return this.normalizePath(path.join(proj, relPath.startsWith('/') || relPath.startsWith('\\') ? relPath.substring(1) : relPath));
    }
    // If no magic variables are found, just normalize
    return this.normalizePath(pathString);
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
    filePath: string | MeldPath, // Input is string or MeldPath
    context: PathValidationContext
  ): Promise<MeldPath> { // Return MeldPath

    // Determine the raw input path string
    const rawInputPath = typeof filePath === 'string' ? filePath : filePath.originalValue;
    let resolvedPath: AbsolutePath | RelativePath; // Internal resolved path string
    let fileExists: boolean | undefined = undefined;
    let isDir: boolean | undefined = undefined;

    // Debug logging
    if (process.env.DEBUG_PATH_VALIDATION === 'true') {
      logger.debug(`[PathService][debug] validatePath called with:`, {
        rawInputPath,
        context,
        testMode: this.testMode
      });
    }

    // 1. Basic non-empty check
    if (!rawInputPath) {
      throw new PathValidationError(
        PathErrorMessages.EMPTY_PATH,
        {
          code: PathErrorCode.E_PATH_EMPTY,
          severity: ErrorSeverity.Fatal,
          path: rawInputPath
        }
      );
    }

    // **Handle URLs - Throw error, this method is only for filesystem paths**
    if (this.isURL(createRawPath(rawInputPath))) {
      throw new PathValidationError(
        PathErrorMessages.EXPECTED_FILESYSTEM_PATH,
        {
          code: PathErrorCode.E_PATH_EXPECTED_FS,
          severity: ErrorSeverity.Fatal,
          path: rawInputPath
        }
      );
    }

    try {
      // 3. Resolve the path string (handles variables, normalization)
      // Use the original string if filePath is already a string, 
      // otherwise use the validated path from MeldPath if provided (though validation should re-run)
      const pathForResolver = typeof filePath === 'string' ? filePath : filePath.validatedPath as string;
      resolvedPath = this.resolvePath(pathForResolver);

      // 4. Null byte check
      if ((resolvedPath as string).includes('\0')) {
        throw new PathValidationError(
          PathErrorMessages.NULL_BYTE,
          {
            code: 'E_PATH_NULL_BYTE',
            severity: ErrorSeverity.Fatal,
            details: { pathString: rawInputPath }
          }
        );
      }

      // 5. Security / Boundary Checks
      const isSecure = this.checkSecurityBoundaries(resolvedPath, context);
      if (!isSecure) {
          // Error is thrown inside checkSecurityBoundaries
          // This path shouldn't be reached if !isSecure, but needed for type safety
          throw new Error('Internal Error: Security check failed but did not throw.');
      }

      // 6. Existence and Type Checks (if required by context.rules)
      if (context.rules.mustExist || context.rules.mustBeFile || context.rules.mustBeDirectory) {
        const { exists, isDirectory } = await this.checkExistenceAndType(resolvedPath, context);
        fileExists = exists;
        isDir = isDirectory;
      }

      // 7. Path is valid, construct and return the MeldResolvedFilesystemPath object
      const isResolvedAbsolute = isAbsolutePath(resolvedPath);
      const validatedMeldPath: MeldResolvedFilesystemPath = {
          contentType: PathContentType.FILESYSTEM,
          originalValue: rawInputPath,
          validatedPath: resolvedPath, // This is AbsolutePath or RelativePath
          isAbsolute: isResolvedAbsolute,
          exists: fileExists,
          isSecure: true // Passed security checks
      };
      return validatedMeldPath;

    } catch (error) {
      // Re-throw known PathValidationErrors, wrap others
      if (error instanceof PathValidationError) {
        throw error;
      }
      if (error instanceof MeldError) {
         throw error;
      }

      // Wrap unexpected errors
      const errorDetails: PathValidationErrorDetails = {
        pathString: rawInputPath,
        cause: error instanceof Error ? error : new Error(String(error))
      };

      throw new PathValidationError(
        `Validation failed for path "${rawInputPath}": ${(error as Error).message}`,
        {
          code: 'E_PATH_INVALID', // Generic code
          severity: ErrorSeverity.Fatal,
          details: errorDetails,
          cause: error // Pass the original cause
        }
      );
    }
  }
  
  // Helper for security checks
  private checkSecurityBoundaries(resolvedPath: AbsolutePath | RelativePath, context: PathValidationContext): boolean {
    if (!context.allowExternalPaths && isAbsolutePath(resolvedPath)) {
        const projectRootDirString = context.projectRoot ? (context.projectRoot as string) : this.projectPath;
        const allowedDirStrings = [
            ...(context.allowedRoots ?? []).map(p => p as string),
            projectRootDirString
        ];
        const isWithinAllowedDir = allowedDirStrings.some(allowedDir =>
            (resolvedPath as string).startsWith(allowedDir)
        );
        if (!isWithinAllowedDir) {
            throw new PathValidationError(
                PathErrorMessages.OUTSIDE_PROJECT_ROOT,
                {
                    code: 'E_PATH_OUTSIDE_ROOT',
                    severity: ErrorSeverity.Fatal,
                    details: {
                        pathString: resolvedPath as string, // Use resolved path here?
                        resolvedPath: resolvedPath as string,
                        allowedRoots: allowedDirStrings
                    }
                }
            );
        }
    }
    // Add other rule checks here (allowAbsolute, allowRelative, allowParentTraversal, etc.)
    // For now, return true if boundary checks pass
    return true;
  }
  
  // Helper for existence and type checks
  private async checkExistenceAndType(resolvedPath: AbsolutePath | RelativePath, context: PathValidationContext): Promise<{ exists: boolean; isDirectory?: boolean }> {
      this.ensureFactoryInitialized();
      if (!this.fsClient) {
         const errorMsg = 'Cannot check path existence/type: FileSystemServiceClient is not available.';
         logger.error(errorMsg, { path: resolvedPath as string });
         throw new PathValidationError(errorMsg, {
             code: 'E_INTERNAL',
             severity: ErrorSeverity.Fatal,
             details: { pathString: resolvedPath as string }
         });
      }

      const exists = await this.fsClient.exists(resolvedPath as string);

      if (context.rules.mustExist && !exists) {
        throw new PathValidationError(
          PathErrorMessages.FILE_NOT_FOUND,
          {
            code: 'E_FILE_NOT_FOUND',
            severity: ErrorSeverity.Fatal,
            details: { pathString: resolvedPath as string }
          }
        );
      }

      let isDirectory: boolean | undefined = undefined;
      if (exists && (context.rules.mustBeFile || context.rules.mustBeDirectory)) {
         isDirectory = await this.fsClient.isDirectory(resolvedPath as string);

         if (context.rules.mustBeFile && isDirectory) {
             throw new PathValidationError(
                 PathErrorMessages.NOT_A_FILE,
                 {
                   code: 'E_PATH_NOT_A_FILE',
                   severity: ErrorSeverity.Fatal,
                   details: { pathString: resolvedPath as string }
                 }
             );
         }

         if (context.rules.mustBeDirectory && !isDirectory) {
             throw new PathValidationError(
                 PathErrorMessages.NOT_A_DIRECTORY,
                 {
                   code: 'E_PATH_NOT_A_DIRECTORY',
                   severity: ErrorSeverity.Fatal,
                   details: { pathString: resolvedPath as string }
                 }
             );
         }
      }
      return { exists, isDirectory };
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
          code: 'E_PATH_NULL_BYTE',
          severity: ErrorSeverity.Fatal,
          details: { pathString: pathString },
          sourceLocation: location
        }
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
  isURL(path: RawPath): boolean {
    if (!path) {
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
  async validateURL(url: RawPath, options?: URLValidationOptions): Promise<UrlPath> {
    if (!this.isURL(url)) {
      throw new PathValidationError('Expected a URL, but received a file path.', { 
        code: PathErrorCode.E_PATH_EXPECTED_URL,
        severity: ErrorSeverity.Fatal,
        path: url
      });
    }

    if (url.includes('\0')) {
      throw new PathValidationError(PathErrorMessages.NULL_BYTE, { 
        code: PathErrorCode.E_PATH_NULL_BYTE, 
        severity: ErrorSeverity.Fatal,
        details: { pathString: url }
      });
    }

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
  async fetchURL(url: UrlPath, options?: URLFetchOptions): Promise<URLResponse> {
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