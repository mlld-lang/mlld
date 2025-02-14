import { IPathService, PathOptions } from './IPathService';
import { IFileSystemService } from '../FileSystemService/IFileSystemService';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError';
import type { Location } from '../../core/types';
import * as path from 'path';

/**
 * Service for validating and normalizing paths
 */
export class PathService implements IPathService {
  private fs!: IFileSystemService;
  private testMode: boolean = false;

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
  async validatePath(path: string, options: PathOptions = {}): Promise<string> {
    // Basic validation
    if (!path) {
      throw new PathValidationError('Path cannot be empty', PathErrorCode.INVALID_PATH, options.location);
    }

    if (path.includes('\0')) {
      throw new PathValidationError('Path cannot contain null bytes', PathErrorCode.NULL_BYTE, options.location);
    }

    // Skip validation in test mode unless explicitly required
    if (this.testMode && !options.mustExist) {
      return path;
    }

    // Normalize path
    const normalizedPath = this.normalizePath(path);

    // Check if path is within base directory
    if (options.baseDir && !options.allowOutsideBaseDir) {
      const normalizedBase = this.normalizePath(options.baseDir);
      if (!normalizedPath.startsWith(normalizedBase)) {
        throw new PathValidationError(
          `Path must be within base directory: ${options.baseDir}`,
          PathErrorCode.OUTSIDE_BASE_DIR,
          options.location
        );
      }
    }

    // Check existence if required
    if (options.mustExist) {
      const exists = await this.fs.exists(normalizedPath);
      if (!exists) {
        throw new PathValidationError(
          `Path does not exist: ${normalizedPath}`,
          PathErrorCode.PATH_NOT_FOUND,
          options.location
        );
      }
    }

    // Check file type if required
    if (options.mustBeFile || options.mustBeDirectory) {
      const isDir = await this.fs.isDirectory(normalizedPath);
      
      if (options.mustBeFile && isDir) {
        throw new PathValidationError(
          `Path must be a file: ${normalizedPath}`,
          PathErrorCode.NOT_A_FILE,
          options.location
        );
      }
      
      if (options.mustBeDirectory && !isDir) {
        throw new PathValidationError(
          `Path must be a directory: ${normalizedPath}`,
          PathErrorCode.NOT_A_DIRECTORY,
          options.location
        );
      }
    }

    return normalizedPath;
  }

  /**
   * Normalize a path by resolving '..' and '.' segments
   */
  normalizePath(pathStr: string): string {
    return path.normalize(pathStr);
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