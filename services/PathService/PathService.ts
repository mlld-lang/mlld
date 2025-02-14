import * as path from 'path';
import { pathLogger as logger } from '../../core/utils/logger';
import { IPathService, type PathOptions } from './IPathService';
import type { IFileSystemService } from '../FileSystemService/IFileSystemService';
import { PathValidationError, PathErrorCode } from '../../core/errors/PathValidationError';

const DEFAULT_OPTIONS: Required<PathOptions> = {
  baseDir: 'project',
  allowOutsideBaseDir: false,
  mustExist: true,
  mustBeFile: false,
  mustBeDirectory: false
};

export class PathService implements IPathService {
  private fileSystem!: IFileSystemService;
  private pathVariables: Map<string, string> = new Map();
  
  constructor(fileSystem?: IFileSystemService) {
    if (fileSystem) {
      this.initialize(fileSystem);
    }
    this.initializeDefaultVariables();
  }
  
  initialize(fileSystem: IFileSystemService): void {
    this.fileSystem = fileSystem;
  }

  private initializeDefaultVariables(): void {
    // Set default path variables
    this.pathVariables.set('HOME', 'home');
    this.pathVariables.set('PROJECTPATH', 'project');
    this.pathVariables.set('HOMEPATH', 'home');
  }
  
  setPathVariable(name: string, value: string): void {
    if (!name) {
      throw new PathValidationError('Variable name cannot be empty', name, PathErrorCode.INVALID_PATH);
    }
    if (!value) {
      throw new PathValidationError('Variable value cannot be empty', value, PathErrorCode.INVALID_PATH);
    }
    this.pathVariables.set(name, value);
  }

  getPathVariable(name: string): string | undefined {
    return this.pathVariables.get(name);
  }

  clearPathVariables(): void {
    this.pathVariables.clear();
    this.initializeDefaultVariables();
  }

  expandPathVariables(inputPath: string): string {
    let result = inputPath;
    for (const [name, value] of this.pathVariables.entries()) {
      const regex1 = new RegExp(`\\$${name}\\b`, 'g');
      const regex2 = new RegExp(`\\$\{${name}\}`, 'g');
      result = result.replace(regex1, value).replace(regex2, value);
    }
    return result;
  }

  async validatePath(inputPath: string): Promise<void> {
    await this.resolvePath(inputPath, {
      mustExist: true,
      allowOutsideBaseDir: false
    });
  }

  async readFileContent(inputPath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(inputPath, {
      mustExist: true,
      mustBeFile: true
    });
    return this.fileSystem.readFile(resolvedPath);
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
      
      // Expand path variables
      const expandedPath = this.expandPathVariables(inputPath);
      
      // Handle absolute paths
      if (path.isAbsolute(expandedPath)) {
        if (!opts.allowOutsideBaseDir) {
          throw new PathValidationError(
            'Absolute paths are not allowed',
            inputPath,
            PathErrorCode.OUTSIDE_BASE_DIR
          );
        }
        return expandedPath;
      }
      
      // Resolve relative to base directory
      const resolvedPath = path.resolve(opts.baseDir, expandedPath);
      
      // First check existence and type if required
      if (opts.mustExist) {
        const exists = await this.fileSystem.exists(resolvedPath);
        if (!exists) {
          throw new PathValidationError(
            'Path does not exist',
            inputPath,
            PathErrorCode.PATH_NOT_FOUND
          );
        }
        
        const isDir = await this.fileSystem.isDirectory(resolvedPath);
        
        if (opts.mustBeFile && isDir) {
          throw new PathValidationError(
            'Path must be a file but is a directory',
            inputPath,
            PathErrorCode.NOT_A_FILE
          );
        }
        
        if (opts.mustBeDirectory && !isDir) {
          throw new PathValidationError(
            'Path must be a directory but is a file',
            inputPath,
            PathErrorCode.NOT_A_DIRECTORY
          );
        }
      }
      
      // Then check if path is outside base directory
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
      
      // Always return absolute path
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
} 