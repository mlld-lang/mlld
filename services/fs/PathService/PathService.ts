import { IPathService, PathOptions } from './IPathService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';
import type { StructuredPath } from 'meld-spec';
import * as path from 'path';

const PATH_ALIAS_PATTERN = /^\$(\.\/|~\/)/;
const CONTAINS_SLASH = /\//;
const CONTAINS_DOT_SEGMENTS = /^\.\.?$|\/\.\.?(?:\/|$)/;

/**
 * Service for validating and normalizing paths
 */
export class PathService implements IPathService {
  private fs!: IFileSystemService;
  private testMode: boolean = false;
  private homePath: string;
  private projectPath: string;

  constructor() {
    this.homePath = process.env.HOME || process.env.USERPROFILE || '/';
    this.projectPath = process.cwd();
  }

  /**
   * Initialize the path service with a file system service
   */
  initialize(fileSystem: IFileSystemService): void {
    this.fs = fileSystem;
  }

  /**
   * Enable test mode for path operations
   */
  enableTestMode(): void {
    this.testMode = true;
  }

  /**
   * Disable test mode for path operations
   */
  disableTestMode(): void {
    this.testMode = false;
  }

  /**
   * Check if test mode is enabled
   */
  isTestMode(): boolean {
    return this.testMode;
  }

  /**
   * Set home path for testing
   */
  setHomePath(path: string): void {
    this.homePath = path;
  }

  /**
   * Set project path for testing
   */
  setProjectPath(path: string): void {
    this.projectPath = path;
  }

  /**
   * Validate a path according to Meld's strict path rules
   */
  private validateMeldPath(filePath: string | StructuredPath, location?: Location): void {
    // If we have a structured path object, use it for validation
    if (typeof filePath !== 'string' && filePath.structured) {
      return this.validateStructuredPath(filePath, location);
    }

    // Fall back to string-based validation for backward compatibility
    const pathStr = typeof filePath === 'string' ? filePath : filePath.raw;

    // Check for dot segments (. or ..)
    if (CONTAINS_DOT_SEGMENTS.test(pathStr)) {
      throw new PathValidationError(
        'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
        PathErrorCode.CONTAINS_DOT_SEGMENTS,
        location
      );
    }

    // If path contains slashes, it must start with a path variable
    if (CONTAINS_SLASH.test(pathStr) && !PATH_ALIAS_PATTERN.test(pathStr)) {
      throw new PathValidationError(
        'Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.INVALID_PATH_FORMAT,
        location
      );
    }

    // Check for raw absolute paths
    if (path.isAbsolute(pathStr)) {
      throw new PathValidationError(
        'Raw absolute paths are not allowed - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.RAW_ABSOLUTE_PATH,
        location
      );
    }
  }

  /**
   * Validate a structured path object
   */
  private validateStructuredPath(pathObj: StructuredPath, location?: Location): void {
    const { structured } = pathObj;

    // Check if this is a simple path with no slashes
    if (!structured.segments || structured.segments.length === 0) {
      return; // Simple filename with no path segments is always valid
    }

    // Check for special variables
    const hasSpecialVar = structured.variables?.special?.some(
      v => v === 'HOMEPATH' || v === 'PROJECTPATH'
    );

    // If path has segments but no special variables, it's invalid
    if (structured.segments.length > 0 && !hasSpecialVar && !structured.cwd) {
      throw new PathValidationError(
        'Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.INVALID_PATH_FORMAT,
        location
      );
    }

    // Check for dot segments in any part of the path
    if (structured.segments.some(segment => segment === '.' || segment === '..')) {
      throw new PathValidationError(
        'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
        PathErrorCode.CONTAINS_DOT_SEGMENTS,
        location
      );
    }
  }

  /**
   * Resolve a path to its absolute form, handling special variables
   */
  resolvePath(filePath: string | StructuredPath, baseDir?: string): string {
    // First validate the path according to Meld rules
    this.validateMeldPath(filePath);

    // If we have a structured path object, use it for resolution
    if (typeof filePath !== 'string' && filePath.structured) {
      return this.resolveStructuredPath(filePath, baseDir);
    }

    // Fall back to string-based resolution for backward compatibility
    const pathStr = typeof filePath === 'string' ? filePath : filePath.raw;

    // Handle special path variables
    if (pathStr.startsWith('$HOMEPATH/') || pathStr.startsWith('$~/')) {
      return path.normalize(path.join(this.homePath, pathStr.substring(pathStr.indexOf('/') + 1)));
    }
    if (pathStr.startsWith('$PROJECTPATH/') || pathStr.startsWith('$./')) {
      return path.normalize(path.join(this.projectPath, pathStr.substring(pathStr.indexOf('/') + 1)));
    }

    // If path contains no slashes, treat as relative to current directory
    if (!CONTAINS_SLASH.test(pathStr)) {
      return path.normalize(path.join(baseDir || process.cwd(), pathStr));
    }

    // At this point, any other path format is invalid
    throw new PathValidationError(
      'Invalid path format - paths must either be simple filenames or start with $. or $~',
      PathErrorCode.INVALID_PATH_FORMAT
    );
  }

  /**
   * Resolve a structured path object to an absolute path
   */
  private resolveStructuredPath(pathObj: StructuredPath, baseDir?: string): string {
    const { structured } = pathObj;

    // If there are no segments, it's a simple filename
    if (!structured.segments || structured.segments.length === 0) {
      return path.normalize(path.join(baseDir || process.cwd(), pathObj.raw));
    }

    // Check for special variables
    if (structured.variables?.special?.includes('HOMEPATH')) {
      return path.normalize(path.join(this.homePath, ...structured.segments));
    }
    
    if (structured.variables?.special?.includes('PROJECTPATH')) {
      return path.normalize(path.join(this.projectPath, ...structured.segments));
    }

    // If it's a current working directory path
    if (structured.cwd) {
      return path.normalize(path.join(baseDir || process.cwd(), ...structured.segments));
    }

    // At this point, any other path format is invalid
    throw new PathValidationError(
      'Invalid path format - paths must either be simple filenames or start with $. or $~',
      PathErrorCode.INVALID_PATH_FORMAT
    );
  }

  /**
   * Validate a path according to the specified options
   */
  async validatePath(filePath: string | StructuredPath, options: PathOptions = {}): Promise<string> {
    // Basic validation
    if (!filePath) {
      throw new PathValidationError(
        'Path cannot be empty',
        PathErrorCode.INVALID_PATH,
        options.location
      );
    }

    const pathStr = typeof filePath === 'string' ? filePath : filePath.raw;
    if (pathStr.includes('\0')) {
      throw new PathValidationError(
        'Path cannot contain null bytes',
        PathErrorCode.NULL_BYTE,
        options.location
      );
    }

    // Skip validation in test mode unless explicitly required
    if (this.testMode && !options.mustExist) {
      return typeof filePath === 'string' ? filePath : filePath.raw;
    }

    // Handle special path variables and validate Meld path rules
    let resolvedPath = this.resolvePath(filePath, options.baseDir);

    // Check if path is within base directory when required
    if (options.allowOutsideBaseDir === false) {
      const baseDir = options.baseDir || this.projectPath;
      const normalizedPath = path.normalize(resolvedPath);
      const normalizedBase = path.normalize(baseDir);
      
      if (!normalizedPath.startsWith(normalizedBase)) {
        throw new PathValidationError(
          `Path must be within base directory: ${baseDir}`,
          PathErrorCode.OUTSIDE_BASE_DIR,
          options.location
        );
      }
    }

    // Check existence if required
    if (options.mustExist || options.mustBeFile || options.mustBeDirectory) {
      const exists = await this.fs.exists(resolvedPath);
      if (!exists) {
        throw new PathValidationError(
          `Path does not exist: ${resolvedPath}`,
          PathErrorCode.PATH_NOT_FOUND,
          options.location
        );
      }

      // Check file type if specified
      if (options.mustBeFile) {
        const isFile = await this.fs.isFile(resolvedPath);
        if (!isFile) {
          throw new PathValidationError(
            `Path must be a file: ${resolvedPath}`,
            PathErrorCode.NOT_A_FILE,
            options.location
          );
        }
      }

      if (options.mustBeDirectory) {
        const isDirectory = await this.fs.isDirectory(resolvedPath);
        if (!isDirectory) {
          throw new PathValidationError(
            `Path must be a directory: ${resolvedPath}`,
            PathErrorCode.NOT_A_DIRECTORY,
            options.location
          );
        }
      }
    }

    return resolvedPath;
  }

  /**
   * Normalize a path by resolving '..' and '.' segments
   */
  normalizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * Join multiple path segments together
   */
  join(...paths: string[]): string {
    return path.join(...paths);
  }

  /**
   * Get the directory name of a path
   */
  dirname(pathStr: string): string {
    return path.dirname(pathStr);
  }

  /**
   * Get the base name of a path
   */
  basename(pathStr: string): string {
    return path.basename(pathStr);
  }
} 