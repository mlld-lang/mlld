import { IPathService, PathOptions } from './IPathService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import type { Location } from '@core/types/index.js';
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
  private validateMeldPath(filePath: string, location?: Location): void {
    // Check for dot segments (. or ..)
    if (CONTAINS_DOT_SEGMENTS.test(filePath)) {
      throw new PathValidationError(
        'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
        PathErrorCode.CONTAINS_DOT_SEGMENTS,
        location
      );
    }

    // If path contains slashes, it must start with a path variable
    if (CONTAINS_SLASH.test(filePath) && !PATH_ALIAS_PATTERN.test(filePath)) {
      throw new PathValidationError(
        'Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.INVALID_PATH_FORMAT,
        location
      );
    }

    // Check for raw absolute paths
    if (path.isAbsolute(filePath)) {
      throw new PathValidationError(
        'Raw absolute paths are not allowed - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.RAW_ABSOLUTE_PATH,
        location
      );
    }
  }

  /**
   * Resolve a path to its absolute form, handling special variables
   */
  resolvePath(filePath: string, baseDir?: string): string {
    // First validate the path according to Meld rules
    this.validateMeldPath(filePath);

    // Handle special path variables
    if (filePath.startsWith('$HOMEPATH/') || filePath.startsWith('$~/')) {
      return path.normalize(path.join(this.homePath, filePath.substring(filePath.indexOf('/') + 1)));
    }
    if (filePath.startsWith('$PROJECTPATH/') || filePath.startsWith('$./')) {
      return path.normalize(path.join(this.projectPath, filePath.substring(filePath.indexOf('/') + 1)));
    }

    // If path contains no slashes, treat as relative to current directory
    if (!CONTAINS_SLASH.test(filePath)) {
      return path.normalize(path.join(baseDir || process.cwd(), filePath));
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
  async validatePath(filePath: string, options: PathOptions = {}): Promise<string> {
    // Basic validation
    if (!filePath) {
      throw new PathValidationError(
        'Path cannot be empty',
        PathErrorCode.INVALID_PATH,
        options.location
      );
    }

    if (filePath.includes('\0')) {
      throw new PathValidationError(
        'Path cannot contain null bytes',
        PathErrorCode.NULL_BYTE,
        options.location
      );
    }

    // Skip validation in test mode unless explicitly required
    if (this.testMode && !options.mustExist) {
      return filePath;
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