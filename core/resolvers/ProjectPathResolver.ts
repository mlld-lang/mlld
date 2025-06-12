import * as path from 'path';
import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo
} from '@core/resolvers/types';
import { MlldResolutionError, MlldFileNotFoundError } from '@core/errors';
import { TaintLevel } from '@security/taint/TaintTracker';
import { IFileSystemService } from '@services/fs/IFileSystemService';

/**
 * Configuration for ProjectPathResolver
 */
export interface ProjectPathResolverConfig {
  /**
   * Base path for the project (typically project root)
   */
  basePath: string;

  /**
   * Whether this resolver is read-only
   */
  readonly?: boolean;
}

/**
 * Project Path Resolver - handles @PROJECTPATH/ references
 * Maps @PROJECTPATH to the project root directory
 */
export class ProjectPathResolver implements Resolver {
  name = 'projectpath';
  description = 'Resolves @PROJECTPATH references to project root files';
  type: ResolverType = 'io';

  constructor(private fileSystem: IFileSystemService) {}

  canResolve(ref: string, config?: ProjectPathResolverConfig): boolean {
    // Can resolve if reference starts with @PROJECTPATH or @.
    return ref.startsWith('@PROJECTPATH') || ref.startsWith('@.');
  }

  /**
   * Resolve a @PROJECTPATH reference to project file content
   */
  async resolve(ref: string, config?: ProjectPathResolverConfig): Promise<ResolverContent> {
    if (!config?.basePath) {
      throw new MlldResolutionError(
        'ProjectPathResolver requires basePath in configuration',
        { reference: ref }
      );
    }

    // Extract the path after @PROJECTPATH or @.
    let relativePath: string;
    if (ref.startsWith('@PROJECTPATH/')) {
      relativePath = ref.substring('@PROJECTPATH/'.length);
    } else if (ref.startsWith('@PROJECTPATH')) {
      relativePath = ref.substring('@PROJECTPATH'.length);
    } else if (ref.startsWith('@./')) {
      relativePath = ref.substring('@./'.length);
    } else if (ref.startsWith('@.')) {
      relativePath = ref.substring('@.'.length);
    } else {
      throw new MlldResolutionError(
        `Invalid PROJECTPATH reference: ${ref}`,
        { reference: ref }
      );
    }

    // Remove leading slash if present
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }

    // Resolve full path relative to project root
    const fullPath = path.resolve(config.basePath, relativePath);

    // Security check: ensure the resolved path is within the project
    const normalizedBasePath = path.resolve(config.basePath);
    const normalizedFullPath = path.resolve(fullPath);
    if (!normalizedFullPath.startsWith(normalizedBasePath)) {
      throw new MlldResolutionError(
        `Path outside project directory: ${relativePath}`,
        { reference: ref, path: fullPath }
      );
    }

    // Check if file exists
    if (!await this.fileSystem.exists(fullPath)) {
      // Try with .mld extension if no extension provided
      if (!path.extname(fullPath)) {
        const withMld = fullPath + '.mld';
        if (await this.fileSystem.exists(withMld)) {
          const content = await this.fileSystem.readFile(withMld);
          const stats = await this.fileSystem.stat(withMld);
          
          return {
            content,
            contentInfo: {
              path: withMld,
              size: stats.size,
              lastModified: stats.mtime,
              contentType: 'text/plain',
              encoding: 'utf-8',
              metadata: {
                resolver: this.name,
                source: 'projectpath',
                originalRef: ref
              }
            },
            taintLevel: TaintLevel.Local
          };
        }
      }
      
      throw new MlldFileNotFoundError(
        `File not found: ${fullPath}`,
        { reference: ref, path: fullPath }
      );
    }

    try {
      // Read the file
      const content = await this.fileSystem.readFile(fullPath);
      
      // Get file stats for metadata
      const stats = await this.fileSystem.stat(fullPath);

      return {
        content,
        contentInfo: {
          path: fullPath,
          size: stats.size,
          lastModified: stats.mtime,
          contentType: 'text/plain',
          encoding: 'utf-8',
          metadata: {
            resolver: this.name,
            source: 'projectpath',
            originalRef: ref
          }
        },
        taintLevel: TaintLevel.Local
      };
    } catch (error) {
      throw new MlldFileNotFoundError(
        `Failed to read file: ${fullPath}`,
        { reference: ref, path: fullPath, cause: error }
      );
    }
  }

  /**
   * Validate resolver configuration
   */
  validateConfig(config: any): string[] {
    const errors: string[] = [];
    
    if (!config) {
      errors.push('Configuration is required');
      return errors;
    }

    if (!config.basePath) {
      errors.push('basePath is required');
    } else if (typeof config.basePath !== 'string') {
      errors.push('basePath must be a string');
    }

    return errors;
  }

  /**
   * Check if an operation is allowed
   */
  async checkAccess(ref: string, operation: 'read' | 'write', config?: ProjectPathResolverConfig): Promise<boolean> {
    // For now, allow all read operations, deny write operations if readonly
    if (operation === 'write' && config?.readonly) {
      return false;
    }
    return operation === 'read';
  }
}