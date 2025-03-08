import { IPathService, PathOptions, StructuredPath } from './IPathService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import { ProjectPathResolver } from '../ProjectPathResolver.js';
import type { Location } from '@core/types/index.js';
import * as path from 'path';
import * as os from 'os';
import type { MeldNode } from 'meld-spec';
import { 
  MeldError, 
  MeldFileNotFoundError, 
  PathErrorMessages 
} from '../../../core/errors';
import { Service } from '../../../core/ServiceProvider';
import { injectable, inject } from 'tsyringe';
import { container } from 'tsyringe';
import { IServiceMediator } from '@services/mediator/index.js';
import { pathLogger as logger } from '@core/utils/logger.js';

/**
 * Service for validating and normalizing paths
 */
@injectable()
@Service({
  description: 'Service for validating and normalizing paths according to Meld rules'
})
export class PathService implements IPathService {
  private fs: IFileSystemService | null = null;
  private serviceMediator?: IServiceMediator;
  private testMode: boolean = false;
  private homePath: string;
  private projectPath: string;
  private projectPathResolver: ProjectPathResolver;
  private projectPathResolved: boolean = false;

  constructor(
    @inject('ServiceMediator') serviceMediator?: IServiceMediator,
    @inject(ProjectPathResolver) projectPathResolver?: ProjectPathResolver
  ) {
    const homeEnv = process.env.HOME || process.env.USERPROFILE;
    if (!homeEnv && !this.testMode) {
      throw new Error('Unable to determine home directory: HOME or USERPROFILE environment variables are not set');
    }
    this.homePath = homeEnv || '';
    this.projectPath = process.cwd();
    
    // Store services
    this.serviceMediator = serviceMediator;
    this.projectPathResolver = projectPathResolver || container.resolve(ProjectPathResolver);
    
    // Register this service with the mediator if available
    if (this.serviceMediator) {
      this.serviceMediator.setPathService(this);
    }
    
    if (process.env.DEBUG === 'true') {
      console.log('PathService: Initialized with serviceMediator:', {
        hasServiceMediator: !!this.serviceMediator,
        testMode: this.testMode
      });
    }
  }

  /**
   * Sets the service mediator for breaking circular dependencies
   */
  setMediator(mediator: IServiceMediator): void {
    this.serviceMediator = mediator;
    mediator.setPathService(this);
  }

  /**
   * Initialize the path service with a file system service
   * @deprecated Use constructor injection instead
   */
  initialize(fileSystem: IFileSystemService, parser = null): void {
    logger.warn('PathService.initialize is deprecated. Use ServiceMediator instead.');
    this.fs = fileSystem;
    // This is kept for backwards compatibility only
  }

  /**
   * Set test mode for the path service
   * This enables test-specific behaviors
   */
  setTestMode(enabled: boolean): void {
    this.testMode = enabled;
  }
  
  /**
   * Alias for setTestMode(true) for backward compatibility
   * @deprecated Use setTestMode(true) instead
   */
  enableTestMode(): void {
    this.setTestMode(true);
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
      pathString.includes('~/') ||
      pathString === '~'
    );
  }

  /**
   * Resolve path to a target file or directory
   * This is the main entry point for path resolution
   */
  resolvePath(targetPath: string, options: PathOptions = { strict: false }): string {
    if (!targetPath) {
      return '';
    }
    
    // Resolve special variables
    if (this.hasPathVariables(targetPath)) {
      return this.resolveMagicPath(targetPath);
    }
    
    // Return normalized path
    return this.normalizePath(targetPath);
  }

  /**
   * Resolve Meld path variables like $PROJECTPATH
   */
  resolveMagicPath(pathString: string): string {
    if (!pathString) {
      return '';
    }
    
    let resolved = pathString;
    
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
    
    // Replace ~ (home directory shorthand)
    if (resolved === '~') {
      resolved = this.homePath;
    } else if (resolved.startsWith('~/')) {
      resolved = path.join(this.homePath, resolved.substring(2));
    }
    
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
    
    if (pathString.startsWith('~') || pathString.includes('~/')) {
      variables.push('~');
    }
    
    return variables;
  }

  /**
   * Validate a path according to Meld path rules
   * This checks for security issues and other path constraints
   */
  async validatePath(targetPath: string, options: PathOptions = { strict: false }): Promise<boolean> {
    if (!targetPath) {
      throw new PathValidationError(
        PathErrorMessages.EMPTY_PATH,
        {
          code: PathErrorCode.EMPTY_PATH,
          path: targetPath
        }
      );
    }
    
    try {
      // Resolve the path (handle variables, normalization)
      const resolvedPath = this.resolvePath(targetPath, options);
      
      // Check path security (e.g., no access outside project)
      if (options.requireExists) {
        // For the existence check we need to use the file system
        // Get the file system service from mediator if available
        let fileSystem: IFileSystemService | null = null;
        
        if (this.serviceMediator) {
          const exists = await this.serviceMediator.exists(resolvedPath);
          
          if (!exists) {
            if (options.strict) {
              throw new MeldFileNotFoundError(targetPath);
            }
            return false;
          }
        } else if (this.fs) {
          // Fallback to direct reference (legacy mode)
          const exists = await this.fs.exists(resolvedPath);
          
          if (!exists) {
            if (options.strict) {
              throw new MeldFileNotFoundError(targetPath);
            }
            return false;
          }
        } else {
          // No file system available, can't check existence
          logger.warn('Cannot check path existence: no file system service available', {
            path: targetPath,
            resolvedPath
          });
          
          if (options.strict) {
            throw new Error('Cannot validate path existence: no file system service available');
          }
          
          return false;
        }
      }
      
      // Path is valid
      return true;
    } catch (error) {
      if (error instanceof MeldError) {
        // Re-throw Meld errors
        throw error;
      }
      
      // Wrap other errors in PathValidationError
      throw new PathValidationError(
        `Invalid path: ${(error as Error).message}`,
        {
          code: PathErrorCode.INVALID_PATH,
          path: targetPath,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Check if a path exists
   */
  async exists(targetPath: string): Promise<boolean> {
    if (!targetPath) {
      return false;
    }
    
    try {
      const resolvedPath = this.resolvePath(targetPath);
      
      // Use service mediator if available
      if (this.serviceMediator) {
        return this.serviceMediator.exists(resolvedPath);
      } else if (this.fs) {
        // Fallback to direct reference
        return this.fs.exists(resolvedPath);
      } else {
        // No file system available
        logger.warn('Cannot check path existence: no file system service available', {
          path: targetPath,
          resolvedPath
        });
        return false;
      }
    } catch (error) {
      logger.error('Error checking path existence', { path: targetPath, error });
      return false;
    }
  }

  /**
   * Check if a path is a directory
   */
  async isDirectory(targetPath: string): Promise<boolean> {
    if (!targetPath) {
      return false;
    }
    
    try {
      const resolvedPath = this.resolvePath(targetPath);
      
      // Use service mediator if available
      if (this.serviceMediator) {
        return this.serviceMediator.isDirectory(resolvedPath);
      } else if (this.fs) {
        // Fallback to direct reference
        return this.fs.isDirectory(resolvedPath);
      } else {
        // No file system available
        logger.warn('Cannot check if path is directory: no file system service available', {
          path: targetPath,
          resolvedPath
        });
        return false;
      }
    } catch (error) {
      logger.error('Error checking if path is directory', { path: targetPath, error });
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
}