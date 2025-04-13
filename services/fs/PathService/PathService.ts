import type { IPathService, URLValidationOptions } from '@services/fs/PathService/IPathService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { PathValidationError, PathErrorCode, PathValidationErrorDetails } from '@services/fs/PathService/errors/PathValidationError';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';
import type { Position, Location } from '@core/types/location';
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
import { injectable, inject, container } from 'tsyringe';
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
import type { PathValidationRules } from '@core/types/paths';

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

    const rawInputPath = isRawPath(filePath) ? filePath : filePath.original;

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
    const raw = pathString;
    const normalized = this.normalizePath(pathString);
    const base = path.isAbsolute(normalized) ? path.parse(normalized).root : '.';
    const segments = normalized.substring(base.length).split('/').filter(Boolean);
    const isUrl = this.isURL(createRawPath(pathString));

    return {
      original: raw,
      normalized: normalized,
      isAbsolute: path.isAbsolute(normalized),
      segments: segments,
      isNormalized: !this.hasDotSegments(normalized),
      isDirectory: normalized.endsWith('/'),
      variables: {},
      pathVariableRefs: []
    };
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
    filePath: string | MeldPath, 
    context: PathValidationContext
  ): Promise<MeldPath> { 
    let pathObj: MeldPath;
    let rawPathString: string;
    const location: Location | undefined = (context as any).location;

    if (typeof filePath === 'string') {
      rawPathString = filePath;
      if (this.isURL(createRawPath(rawPathString))) {
        const urlOptions: URLValidationOptions = { /* construct from context if needed, excluding location */ }; 
        pathObj = await this.validateURL(createRawPath(rawPathString), urlOptions); 
      } else {
        const baseDir = context.workingDirectory;
        const resolved = this.resolvePath(createRawPath(rawPathString), baseDir as RawPath); 
        pathObj = { 
            contentType: PathContentType.FILESYSTEM, 
            originalValue: rawPathString, 
            validatedPath: resolved,
            isAbsolute: isAbsolutePath(resolved),
            isValidSyntax: true,
            exists: undefined,
            isSecure: true 
        };
      }
    } else {
      pathObj = filePath;
      rawPathString = pathObj.originalValue;
    }

    if (pathObj.contentType === PathContentType.FILESYSTEM) {
      if (rawPathString.includes('\0')) {
        throw new PathValidationError(PathErrorMessages.NULL_BYTE, {
          code: PathErrorCode.E_PATH_NULL_BYTE, 
          path: rawPathString,
        }, location);
      }
    }
    
    if (isUrlPath(pathObj)) {
      return pathObj;
    }

    let absolutePathToCheck: AbsolutePath;
    if (isAbsolutePath(pathObj)) {
        absolutePathToCheck = pathObj;
    } else if (isRelativePath(pathObj)) {
        absolutePathToCheck = unsafeCreateAbsolutePath(path.resolve(context.workingDirectory, pathObj));
    } else {
      throw new PathValidationError(PathErrorMessages.INVALID_PATH, {
          code: PathErrorCode.E_PATH_INVALID,
          path: rawPathString,
      }, location);
    }

    const fsPathObj: MeldResolvedFilesystemPath & { isDirectory?: boolean } = { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: rawPathString, 
        validatedPath: absolutePathToCheck, 
        isAbsolute: true, 
        isValidSyntax: true, 
        exists: undefined,
        isSecure: true,
        isDirectory: undefined
    };

    fsPathObj.isSecure = this.checkSecurityBoundaries(absolutePathToCheck, context);
    if (!fsPathObj.isSecure) {
      throw new PathValidationError(PathErrorMessages.OUTSIDE_PROJECT_ROOT, {
        code: PathErrorCode.E_PATH_OUTSIDE_ROOT, 
        path: absolutePathToCheck, 
      }, location);
    }

    try {
      const { exists, isDirectory } = await this.checkExistenceAndType(absolutePathToCheck, context);
      fsPathObj.exists = exists;
      fsPathObj.isDirectory = isDirectory;

      if (context.rules.mustExist && !exists) {
        const isDirExpected = context.rules.mustBeDirectory;
        throw new PathValidationError(
          isDirExpected ? PathErrorMessages.PATH_NOT_FOUND : PathErrorMessages.FILE_NOT_FOUND,
          {
            code: isDirExpected ? PathErrorCode.E_PATH_NOT_FOUND : PathErrorCode.E_FILE_NOT_FOUND,
            path: absolutePathToCheck,
          }, location);
      }

      if (exists && context.rules.mustBeFile && fsPathObj.isDirectory) { 
        throw new PathValidationError(PathErrorMessages.NOT_A_FILE, {
          code: PathErrorCode.E_PATH_NOT_A_FILE,
          path: absolutePathToCheck,
        }, location);
      }

      if (exists && context.rules.mustBeDirectory && !fsPathObj.isDirectory) { 
        throw new PathValidationError(PathErrorMessages.NOT_A_DIRECTORY, {
          code: PathErrorCode.E_PATH_NOT_A_DIRECTORY,
          path: absolutePathToCheck,
        }, location);
      }
    } catch (error: unknown) {
      if (error instanceof PathValidationError) throw error; 
      const cause = error instanceof Error ? error : new Error(String(error)); 
      throw new PathValidationError(PathErrorMessages.INTERNAL_ERROR, {
        code: PathErrorCode.E_INTERNAL,
        path: absolutePathToCheck,
        cause: cause,
      }, location);
    }

    return fsPathObj;
  }
  
  private checkSecurityBoundaries(resolvedPath: AbsolutePath | RelativePath, context: PathValidationContext): boolean {
    if (context.rules.allowExternalPaths) {
      return true;
    }
    const absolutePath = isAbsolutePath(resolvedPath) ? resolvedPath : path.resolve(context.workingDirectory, resolvedPath);
    const projPath = this.projectPathResolver.getProjectPath();

    if (!absolutePath.startsWith(projPath + path.sep) && absolutePath !== projPath) {
      throw new PathValidationError(PathErrorMessages.OUTSIDE_PROJECT_ROOT, {
        code: PathErrorCode.E_PATH_OUTSIDE_ROOT,
        path: absolutePath,
      }, (context as any).location);
    }
    return true;
  }
  
  private async checkExistenceAndType(resolvedPath: AbsolutePath | RelativePath, context: PathValidationContext): Promise<{ exists: boolean; isDirectory?: boolean }> {
    this.ensureFactoryInitialized();
    if (!this.fsClient) {
      logger.warn('FileSystemServiceClient not available for existence check');
      return { exists: false };
    }
    try {
        const pathString = isAbsolutePath(resolvedPath) ? resolvedPath : path.resolve(context.workingDirectory, resolvedPath);
        const exists = await this.fsClient.exists(pathString); 
        let isDirectory: boolean | undefined = undefined;
        if (exists) {
            isDirectory = await this.fsClient.isDirectory(pathString); 
        }
        return { exists, isDirectory };
    } catch (error) {
        const pathString = isAbsolutePath(resolvedPath) ? resolvedPath : path.resolve(context.workingDirectory, resolvedPath);
        logger.error('Error checking path existence/type', { path: pathString, error }); 
        throw new PathValidationError(PathErrorMessages.INTERNAL_ERROR, {
          code: PathErrorCode.E_INTERNAL,
          path: pathString, 
          cause: error instanceof Error ? error : new Error(String(error)),
      }, (context as any).location);
    }
  }

  /**
   * Validate a Meld path with location information
   * This is a convenience method for tests
   */
  validateMeldPath(pathString: string, location?: Location): void {
    if (pathString.includes('\0')) {
      throw new PathValidationError(PathErrorMessages.NULL_BYTE, {
        code: PathErrorCode.E_PATH_NULL_BYTE, 
        path: pathString,
      }, location);
    }
  }

  /**
   * Checks if a path exists
   * @param filePath - The path to check
   * @returns True if the path exists, false otherwise
   */
  async exists(filePath: ValidatedResourcePath): Promise<boolean> { 
    this.ensureFactoryInitialized();
    if (!this.fsClient) return false; 
    try {
      return await this.fsClient.exists(filePath);
    } catch (error) {
      logger.error('Error checking existence', { path: filePath, error }); 
      return false; 
    }
  }

  /**
   * Checks if a path is a directory
   * @param dirPath - The path to check
   * @returns True if the path is a directory, false otherwise
   */
  async isDirectory(dirPath: ValidatedResourcePath): Promise<boolean> { 
    this.ensureFactoryInitialized();
    if (!this.fsClient) return false; 
    try {
      return await this.fsClient.isDirectory(dirPath);
    } catch (error) {
      logger.error('Error checking directory type', { path: dirPath, error }); 
      return false;
    }
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
    try {
      const url = new URL(path);
      return ['http:', 'https:'].includes(url.protocol);
    } catch (_) {
      return false;
    }
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
    const urlString = url;
    if (!this.isURL(url)) {
      throw new PathValidationError(PathErrorMessages.EXPECTED_FILESYSTEM_PATH, {
        code: PathErrorCode.E_PATH_EXPECTED_FS,
        path: urlString,
      }, options?.location);
    }

    if (options?.allowedProtocols && !options.allowedProtocols.some(p => urlString.startsWith(`${p}:`))) {
      throw new PathValidationError('URL protocol not allowed', {
        code: PathErrorCode.E_URL_PROTOCOL_NOT_ALLOWED,
        path: urlString,
      }, options?.location);
    }

    if (this.urlContentResolver) {
      try {
        await this.urlContentResolver.validateURL(urlString, options);
      } catch (error) {
         const cause = error instanceof Error ? error : new Error(String(error));
         throw new PathValidationError('URL validation failed via resolver', {
           code: PathErrorCode.E_URL_VALIDATION_FAILED,
           path: urlString,
           cause: cause
         }, options?.location);
      }
    }

    return unsafeCreateUrlPath(urlString);
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
      throw new MeldError('URLContentResolver service is not available', { 
          code: 'SERVICE_UNAVAILABLE', 
          severity: ErrorSeverity.Fatal 
        });
    }
    try {
      return await this.urlContentResolver.fetchURL(url, options); 
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new PathValidationError('Failed to fetch URL content', { 
        code: PathErrorCode.E_URL_FETCH_FAILED,
        path: url, 
        cause: cause
      });
    }
  }
}