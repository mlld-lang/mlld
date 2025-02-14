import { IPathService, PathOptions } from './IPathService';
import { IFileSystemService } from '../FileSystemService/IFileSystemService';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError';
import * as path from 'path';

/**
 * Service for validating and normalizing paths
 */
export class PathService implements IPathService {
  private fileSystem!: IFileSystemService;
  private testMode: boolean = false;

  /**
   * Initialize the path service with a file system service
   */
  initialize(fileSystem: IFileSystemService): void {
    this.fileSystem = fileSystem;
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
   * Resolve a path to its absolute form
   */
  resolvePath(filePath: string, baseDir?: string): string {
    // If path is already absolute, just normalize it
    if (path.isAbsolute(filePath)) {
      return path.normalize(filePath);
    }

    // If no base directory provided, use current working directory
    const base = baseDir || process.cwd();

    // Join with base directory and normalize
    return path.normalize(path.join(base, filePath));
  }

  /**
   * Validate a path according to the specified options
   */
  async validatePath(filePath: string, options: PathOptions = {}): Promise<void> {
    if (!filePath) {
      throw new PathValidationError(
        'Path cannot be empty',
        PathErrorCode.INVALID_PATH,
        { filePath, options }
      );
    }

    if (filePath.includes('\0')) {
      throw new PathValidationError(
        'Path cannot contain null bytes',
        PathErrorCode.NULL_BYTE,
        { filePath, options }
      );
    }

    // Skip validation in test mode unless explicitly required
    if (this.testMode && !options.mustExist) {
      return;
    }

    // Ensure path is absolute
    const absolutePath = this.resolvePath(filePath);

    // Check if path is within base directory if specified
    if (options.baseDir && !options.allowOutsideBaseDir) {
      const baseDir = this.resolvePath(options.baseDir);
      const relative = path.relative(baseDir, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new PathValidationError(
          `Path must be within base directory: ${options.baseDir}`,
          PathErrorCode.OUTSIDE_BASE_DIR,
          { filePath, options }
        );
      }
    }

    // Check existence if required
    if (options.mustExist !== false) {
      const exists = await this.fileSystem.exists(absolutePath);
      if (!exists) {
        throw new PathValidationError(
          `Path does not exist: ${filePath}`,
          PathErrorCode.PATH_NOT_FOUND,
          { filePath, options }
        );
      }

      // Check file type if specified
      if (options.mustBeFile || options.mustBeDirectory) {
        const stats = await this.fileSystem.stat(absolutePath);

        if (options.mustBeFile && !stats.isFile()) {
          throw new PathValidationError(
            `Path must be a file: ${filePath}`,
            PathErrorCode.NOT_A_FILE,
            { filePath, options }
          );
        }

        if (options.mustBeDirectory && !stats.isDirectory()) {
          throw new PathValidationError(
            `Path must be a directory: ${filePath}`,
            PathErrorCode.NOT_A_DIRECTORY,
            { filePath, options }
          );
        }
      }
    }
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
  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  /**
   * Get the base name of a path
   */
  basename(filePath: string): string {
    return path.basename(filePath);
  }
} 