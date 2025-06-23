import * as path from 'path';
import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo,
  ResolverCapabilities
} from '@core/resolvers/types';
import { MlldResolutionError, MlldFileNotFoundError } from '@core/errors';
import { IFileSystemService } from '@services/fs/IFileSystemService';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { logger } from '@core/utils/logger';

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
  name = 'PROJECTPATH';
  description = 'Resolves @PROJECTPATH references to project root files';
  type: ResolverType = 'io';
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: true, output: false },
    supportedContentTypes: ['text', 'module'],
    defaultContentType: 'text',
    priority: 1,
    cache: { strategy: 'none' } // Project path is static
  };

  constructor(private fileSystem: IFileSystemService) {
    // No caching needed - project path is static
  }

  canResolve(ref: string, config?: ProjectPathResolverConfig): boolean {
    // Can resolve if reference starts with @PROJECTPATH or @. 
    // OR if we have a config (which means prefix was stripped)
    return ref.startsWith('@PROJECTPATH') || ref.startsWith('@.') || !!config;
  }

  /**
   * Resolve a @PROJECTPATH reference
   */
  async resolve(ref: string, config?: ProjectPathResolverConfig): Promise<ResolverContent> {
    // Try config basePath first
    let basePath = config?.basePath;
    
    // If not provided or seems incorrect, detect project root
    if (!basePath || !(await this.isProjectRoot(basePath))) {
      logger.debug(`Detecting project root (basePath: ${basePath})`);
      basePath = await this.findProjectRootFromCwd();
    }
    
    if (!basePath) {
      throw new MlldResolutionError(
        'ProjectPathResolver: Unable to determine project root. ' +
        'This usually means the resolver registry was not properly configured. ' +
        'Check that @. or @PROJECTPATH prefixes are mapped to PROJECTPATH resolver with basePath.',
        { reference: ref, availableConfig: Object.keys(config || {}) }
      );
    }

    // Variable context - return the project path as text
    if (!config || !config.context || config.context === 'variable') {
      // If it's just @PROJECTPATH, return the base path
      if (ref === '@PROJECTPATH' || ref === 'PROJECTPATH') {
        return {
          content: basePath,
          contentType: 'text',
          metadata: {
            source: 'PROJECTPATH',
            timestamp: new Date()
          }
        };
      }
    }

    // Path context - read the file content
    if (config.context === 'path') {
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
        // With prefix stripping, we might just get the path directly
        relativePath = ref;
      }

      // Remove leading slash if present
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }

      // If no path specified, just return the project path
      if (!relativePath) {
        return {
          content: basePath,
          contentType: 'text',
          metadata: {
            source: 'PROJECTPATH',
            timestamp: new Date()
          }
        };
      }

      // Resolve full path relative to project root
      const fullPath = path.resolve(basePath, relativePath);

      // Security check: ensure the resolved path is within the project
      const normalizedBasePath = path.resolve(basePath);
      const normalizedFullPath = path.resolve(fullPath);
      if (!normalizedFullPath.startsWith(normalizedBasePath)) {
        throw new MlldResolutionError(
          `Path outside project directory: ${relativePath}`,
          {}
        );
      }

      // Check if file exists
      if (!await this.fileSystem.exists(fullPath)) {
        // Try with .mld extension if no extension provided
        if (!path.extname(fullPath)) {
          const withMld = fullPath + '.mld';
          if (await this.fileSystem.exists(withMld)) {
            const content = await this.fileSystem.readFile(withMld);
            const contentType = await this.detectContentType(withMld, content);
            
            return {
              content,
              contentType,
              metadata: {
                source: withMld,
                timestamp: new Date(),
                originalRef: ref
              }
            };
          }
        }
        
        throw new MlldFileNotFoundError(
          `File not found: ${fullPath}`,
          { path: fullPath }
        );
      }

      try {
        // Read the file
        const content = await this.fileSystem.readFile(fullPath);
        const contentType = await this.detectContentType(fullPath, content);

        return {
          content,
          contentType,
          metadata: {
            source: fullPath,
            timestamp: new Date(),
            originalRef: ref
          }
        };
      } catch (error) {
        throw new MlldFileNotFoundError(
          `Failed to read file: ${fullPath}`,
          { path: fullPath }
        );
      }
    }

    // Import context - similar to path but validates module content
    if (config.context === 'import') {
      // For imports, delegate to path logic but ensure module validation
      const result = await this.resolve(ref, { ...config, context: 'path' });
      
      // Validate that imported content is a module
      if (result.contentType !== 'module') {
        throw new MlldResolutionError(
          `Import target is not a module: ${ref}`,
          {}
        );
      }
      
      return result;
    }

    throw new MlldResolutionError(
      `PROJECTPATH resolver does not support context: ${config.context}`,
      {}
    );
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

  /**
   * Detect content type based on file extension and content
   */
  private async detectContentType(filePath: string, content: string): Promise<'module' | 'data' | 'text'> {
    // Check file extension
    if (filePath.endsWith('.mld') || filePath.endsWith('.mlld')) {
      return 'module';
    }
    if (filePath.endsWith('.json')) {
      return 'data';
    }
    
    // Try to detect mlld module content
    try {
      const { parse } = await import('@grammar/parser');
      const result = await parse(content);
      if (result.success && this.hasModuleExports(result.ast)) {
        return 'module';
      }
    } catch {
      // Not valid mlld
    }
    
    // Try JSON
    try {
      JSON.parse(content);
      return 'data';
    } catch {
      // Not JSON
    }
    
    return 'text';
  }
  
  /**
   * Check if AST has module exports
   */
  private hasModuleExports(ast: any): boolean {
    // Check if there are any directive nodes (not just text/newlines)
    if (!ast || !Array.isArray(ast)) return false;
    
    return ast.some(node => 
      node && node.type === 'Directive' && 
      ['var', 'exe', 'path'].includes(node.kind)
    );
  }

  /**
   * Check if a path is likely a project root
   */
  private async isProjectRoot(path: string): Promise<boolean> {
    // Check for project indicators
    const indicators = ['package.json', '.git', 'mlld.config.json', 'mlld.lock.json'];
    for (const indicator of indicators) {
      if (await this.fileSystem.exists(path + '/' + indicator)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Find project root from current working directory
   */
  private async findProjectRootFromCwd(): Promise<string | null> {
    try {
      const projectRoot = await findProjectRoot(process.cwd(), this.fileSystem);
      return projectRoot;
    } catch (error) {
      logger.warn('Failed to find project root:', error);
      return null;
    }
  }
}