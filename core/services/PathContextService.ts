/**
 * Path Context Service
 * 
 * Provides a clear, consistent model for all path operations in the mlld system.
 * Each path has a specific purpose and clear semantics.
 */

import * as path from 'path';
import * as os from 'os';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { logger } from '@core/utils/logger';

/**
 * PathContext provides explicit path definitions for all mlld operations
 */
export interface PathContext {
  /**
   * The mlld project root directory.
   * - Contains mlld-config.json and/or mlld-lock.json
   * - Base for module resolution (@user/module)
   * - Base for @root resolver paths
   * - Used for security boundaries
   */
  projectRoot: string;
  
  /**
   * Directory containing the current .mld file being processed.
   * - Base for @base variable and resolver paths
   * - Base for relative imports (./file.mld)
   * - Base for relative file references
   * - Default working directory for commands
   */
  fileDirectory: string;
  
  /**
   * Full absolute path to current file.
   * - Used for error reporting
   * - Used for import cycle detection
   * - Optional (e.g., when processing stdin)
   */
  filePath?: string;
  
  /**
   * Directory where shell commands execute.
   * - Defaults to fileDirectory
   * - Can be overridden for special cases
   * - Used by /run and /exe directives
   */
  executionDirectory: string;
  
  /**
   * Directory where mlld CLI was invoked.
   * - Used for user-friendly path display
   * - Used for relative path output
   * - Always process.cwd()
   */
  invocationDirectory: string;
}

/**
 * Options for building a PathContext
 */
export interface PathContextOptions {
  /**
   * Override the execution directory (defaults to file directory)
   */
  executionDirectory?: string;
  
  /**
   * Override the invocation directory (defaults to process.cwd())
   */
  invocationDirectory?: string;
  
  /**
   * Force a specific project root (skips auto-detection)
   */
  projectRoot?: string;
}

/**
 * Result of PathContext validation
 */
export interface PathContextValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Builder for creating PathContext instances
 */
export class PathContextBuilder {
  /**
   * Create a PathContext from a file path
   */
  static async fromFile(
    filePath: string,
    fileSystem: IFileSystemService,
    options: PathContextOptions = {}
  ): Promise<PathContext> {
    const absoluteFilePath = path.resolve(filePath);
    const fileDirectory = path.dirname(absoluteFilePath);
    
    // Find project root (or use override)
    const projectRoot = options.projectRoot || 
      await findProjectRoot(fileDirectory, fileSystem);
    
    logger.debug('Building PathContext', {
      filePath: absoluteFilePath,
      fileDirectory,
      projectRoot,
      executionDirectory: options.executionDirectory || fileDirectory,
      invocationDirectory: options.invocationDirectory || process.cwd()
    });
    
    return {
      projectRoot,
      fileDirectory,
      filePath: absoluteFilePath,
      executionDirectory: options.executionDirectory || fileDirectory,
      invocationDirectory: options.invocationDirectory || process.cwd()
    };
  }
  
  /**
   * Create a PathContext for stdin or default cases
   */
  static fromDefaults(options: PathContextOptions = {}): PathContext {
    const cwd = process.cwd();
    
    return {
      projectRoot: options.projectRoot || cwd,
      fileDirectory: cwd,
      executionDirectory: options.executionDirectory || cwd,
      invocationDirectory: options.invocationDirectory || cwd
    };
  }
  
  /**
   * Create a child context for a new file (e.g., during imports)
   */
  static async forChildFile(
    parentContext: PathContext,
    childFilePath: string,
    fileSystem: IFileSystemService
  ): Promise<PathContext> {
    const absoluteChildPath = path.resolve(
      parentContext.fileDirectory,
      childFilePath
    );
    const childDirectory = path.dirname(absoluteChildPath);
    
    // Child inherits project root from parent
    // but updates file-specific paths
    return {
      projectRoot: parentContext.projectRoot,
      fileDirectory: childDirectory,
      filePath: absoluteChildPath,
      executionDirectory: childDirectory, // Commands run in child's directory
      invocationDirectory: parentContext.invocationDirectory // Inherited
    };
  }
}

/**
 * Service for managing and validating PathContext instances
 */
export class PathContextService {
  constructor(private fileSystem: IFileSystemService) {}
  
  /**
   * Validate a PathContext
   */
  async validate(context: PathContext): Promise<PathContextValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if paths are absolute
    if (!path.isAbsolute(context.projectRoot)) {
      errors.push('projectRoot must be an absolute path');
    }
    if (!path.isAbsolute(context.fileDirectory)) {
      errors.push('fileDirectory must be an absolute path');
    }
    if (!path.isAbsolute(context.executionDirectory)) {
      errors.push('executionDirectory must be an absolute path');
    }
    if (!path.isAbsolute(context.invocationDirectory)) {
      errors.push('invocationDirectory must be an absolute path');
    }
    if (context.filePath && !path.isAbsolute(context.filePath)) {
      errors.push('filePath must be an absolute path when provided');
    }
    
    // Check if directories exist
    if (!(await this.fileSystem.exists(context.projectRoot))) {
      warnings.push(`projectRoot does not exist: ${context.projectRoot}`);
    }
    if (!(await this.fileSystem.exists(context.fileDirectory))) {
      errors.push(`fileDirectory does not exist: ${context.fileDirectory}`);
    }
    if (!(await this.fileSystem.exists(context.executionDirectory))) {
      warnings.push(`executionDirectory does not exist: ${context.executionDirectory}`);
    }
    
    // Check if file exists (if provided)
    if (context.filePath && !(await this.fileSystem.exists(context.filePath))) {
      errors.push(`filePath does not exist: ${context.filePath}`);
    }
    
    // Check if mlld config files exist in project root
    const configFiles = [
      'mlld-config.json',
      'mlld-lock.json',
      'mlld.lock.json'  // Backward compatibility
    ];

    const hasConfig = await Promise.all(
      configFiles.map(file => this.fileSystem.exists(path.join(context.projectRoot, file)))
    );

    if (!hasConfig.some(exists => exists)) {
      warnings.push(`No mlld config files found in project root: ${context.projectRoot}`);
    }
    
    // Validate relationships
    if (context.filePath && path.dirname(context.filePath) !== context.fileDirectory) {
      errors.push('filePath must be in fileDirectory');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Get a display-friendly path relative to invocation directory
   */
  getDisplayPath(context: PathContext, absolutePath: string): string {
    return path.relative(context.invocationDirectory, absolutePath);
  }
  
  /**
   * Check if a path is inside the project
   */
  isInsideProject(context: PathContext, absolutePath: string): boolean {
    const relative = path.relative(context.projectRoot, absolutePath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }
  
  /**
   * Resolve a relative path from the file directory
   */
  resolveFromFile(context: PathContext, relativePath: string): string {
    return path.resolve(context.fileDirectory, relativePath);
  }
  
  /**
   * Resolve a relative path from the project root
   */
  resolveFromProject(context: PathContext, relativePath: string): string {
    return path.resolve(context.projectRoot, relativePath);
  }
}
