import * as path from 'path';
import { pathLogger as logger } from '../../core/utils/logger';
import { IPathService, type PathOptions } from './IPathService';
import type { IFileSystemService } from '../FileSystemService/IFileSystemService';
import { PathValidationError, PathErrorCode } from '../../core/errors/PathValidationError';

const DEFAULT_OPTIONS: Required<PathOptions> = {
  baseDir: process.cwd(),
  allowOutsideBaseDir: false,
  mustExist: true,
  mustBeDirectory: false,
  mustBeFile: false,
  expandVariables: true
};

export class PathService implements IPathService {
  private fileSystem!: IFileSystemService;
  private pathVariables = new Map<string, string>();
  
  initialize(fileSystem: IFileSystemService): void {
    this.fileSystem = fileSystem;
    
    // Initialize default variables
    this.setPathVariable('HOME', process.env.HOME || '');
    this.setPathVariable('PROJECTPATH', process.cwd());
    this.setPathVariable('~', process.env.HOME || '');
    this.setPathVariable('.', process.cwd());
  }
  
  async resolvePath(inputPath: string, options?: PathOptions): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    logger.debug('Resolving path', { inputPath, options: opts });
    
    try {
      // Basic validation
      if (!inputPath) {
        throw new PathValidationError('Path cannot be empty', inputPath, PathErrorCode.INVALID_PATH);
      }
      
      if (inputPath.includes('\0')) {
        throw new PathValidationError('Path contains null bytes', inputPath, PathErrorCode.NULL_BYTE);
      }
      
      // Expand variables if needed
      let resolvedPath = opts.expandVariables ? this.expandPathVariables(inputPath) : inputPath;
      
      // Resolve relative to base directory
      resolvedPath = path.resolve(opts.baseDir, resolvedPath);
      
      // Check if path is outside base directory
      if (!opts.allowOutsideBaseDir) {
        const relative = path.relative(opts.baseDir, resolvedPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          throw new PathValidationError(
            'Path resolves outside base directory',
            inputPath,
            PathErrorCode.OUTSIDE_BASE_DIR
          );
        }
      }
      
      // Existence and type checks
      if (opts.mustExist) {
        const exists = await this.fileSystem.exists(resolvedPath);
        if (!exists) {
          throw new PathValidationError(
            'Path does not exist',
            inputPath,
            PathErrorCode.PATH_NOT_FOUND
          );
        }
        
        if (opts.mustBeFile) {
          const isDir = await this.fileSystem.isDirectory(resolvedPath);
          if (isDir) {
            throw new PathValidationError(
              'Path must be a file but is a directory',
              inputPath,
              PathErrorCode.NOT_A_FILE
            );
          }
        }
        
        if (opts.mustBeDirectory) {
          const isDir = await this.fileSystem.isDirectory(resolvedPath);
          if (!isDir) {
            throw new PathValidationError(
              'Path must be a directory but is a file',
              inputPath,
              PathErrorCode.NOT_A_DIRECTORY
            );
          }
        }
      }
      
      logger.debug('Successfully resolved path', { inputPath, resolvedPath });
      return resolvedPath;
    } catch (error) {
      if (error instanceof PathValidationError) {
        throw error;
      }
      logger.error('Failed to resolve path', { inputPath, error });
      throw new PathValidationError(
        'Failed to resolve path',
        inputPath,
        PathErrorCode.INVALID_PATH
      );
    }
  }
  
  async resolvePaths(paths: string[], options?: PathOptions): Promise<string[]> {
    return Promise.all(paths.map(p => this.resolvePath(p, options)));
  }
  
  async isValidPath(path: string, options?: PathOptions): Promise<boolean> {
    try {
      await this.resolvePath(path, options);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  expandPathVariables(path: string): string {
    let result = path;
    
    // Replace all variables
    for (const [name, value] of this.pathVariables.entries()) {
      const pattern = new RegExp(`\\$${name}|\\$\{${name}\}`, 'g');
      result = result.replace(pattern, value);
    }
    
    logger.debug('Expanded path variables', { original: path, expanded: result });
    return result;
  }
  
  setPathVariable(name: string, value: string): void {
    if (!name || !value) {
      throw new PathValidationError(
        'Variable name and value cannot be empty',
        name,
        PathErrorCode.INVALID_VARIABLE
      );
    }
    
    this.pathVariables.set(name, value);
    logger.debug('Set path variable', { name, value });
  }
  
  getPathVariable(name: string): string | undefined {
    return this.pathVariables.get(name);
  }
  
  clearPathVariables(): void {
    this.pathVariables.clear();
    logger.debug('Cleared all path variables');
    
    // Reinitialize default variables
    this.setPathVariable('HOME', process.env.HOME || '');
    this.setPathVariable('PROJECTPATH', process.cwd());
    this.setPathVariable('~', process.env.HOME || '');
    this.setPathVariable('.', process.cwd());
  }
} 