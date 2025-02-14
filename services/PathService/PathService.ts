import { PathValidationError, PathErrorCode } from '../../core/errors/PathValidationError';
import { IFileSystem } from '../FileSystem/IFileSystem';
import { IPathService, PathOptions } from './IPathService';
import * as path from 'path';

export class PathService implements IPathService {
  private testMode = false;

  constructor(private readonly fileSystem: IFileSystem) {}

  public enableTestMode(): void {
    this.testMode = true;
  }

  public disableTestMode(): void {
    this.testMode = false;
  }

  public isTestMode(): boolean {
    return this.testMode;
  }

  public async validatePath(filePath: string, options: PathOptions = {}): Promise<void> {
    if (!filePath) {
      throw new PathValidationError('Path cannot be empty', filePath, PathErrorCode.INVALID_PATH);
    }

    if (filePath.includes('\0')) {
      throw new PathValidationError('Path cannot contain null bytes', filePath, PathErrorCode.NULL_BYTE);
    }

    const normalizedPath = this.normalizePath(filePath);
    
    if (options.baseDir) {
      const normalizedBase = this.normalizePath(options.baseDir);
      const isOutside = !normalizedPath.startsWith(normalizedBase);
      
      if (isOutside && !options.allowOutsideBaseDir) {
        throw new PathValidationError(
          `Path must be within base directory: ${options.baseDir}`,
          filePath,
          PathErrorCode.OUTSIDE_BASE_DIR
        );
      }
    }

    if (options.mustExist !== false) {
      const exists = await this.fileSystem.exists(normalizedPath);
      if (!exists) {
        throw new PathValidationError(
          `Path does not exist: ${filePath}`,
          filePath,
          PathErrorCode.PATH_NOT_FOUND
        );
      }
    }

    if (options.mustBeFile || options.mustBeDirectory) {
      const stats = await this.fileSystem.stat(normalizedPath);
      
      if (options.mustBeFile && !stats.isFile()) {
        throw new PathValidationError(
          `Path must be a file: ${filePath}`,
          filePath,
          PathErrorCode.NOT_A_FILE
        );
      }

      if (options.mustBeDirectory && !stats.isDirectory()) {
        throw new PathValidationError(
          `Path must be a directory: ${filePath}`,
          filePath,
          PathErrorCode.NOT_A_DIRECTORY
        );
      }
    }
  }

  public normalizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  public join(...paths: string[]): string {
    return path.join(...paths);
  }

  public dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  public basename(filePath: string): string {
    return path.basename(filePath);
  }
} 