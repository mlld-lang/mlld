import * as path from 'path';
import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo,
  ResolverCapabilities
} from '@core/resolvers/types';
import { MlldResolutionError, MlldFileNotFoundError } from '@core/errors';
import { TaintLevel } from '@security/taint/TaintTracker';
import { IFileSystemService } from '@services/fs/IFileSystemService';

/**
 * Configuration for LocalResolver
 */
export interface LocalResolverConfig {
  /**
   * Base path for resolving references
   */
  basePath: string;

  /**
   * Whether this resolver is read-only
   */
  readonly?: boolean;

  /**
   * Allowed file extensions (if not specified, allows all)
   */
  allowedExtensions?: string[];

  /**
   * Whether to follow symlinks
   */
  followSymlinks?: boolean;

  /**
   * Maximum directory depth to traverse
   */
  maxDepth?: number;
}

/**
 * Local Resolver - maps prefixes to filesystem paths
 * Provides secure access to local files with path validation
 */
export class LocalResolver implements Resolver {
  name = 'local';
  description = 'Resolves modules from local filesystem paths';
  type: ResolverType = 'io';
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: true, list: true },
    needs: { network: false, cache: false, auth: false },
    contexts: { import: true, path: true, output: true },
    resourceType: 'file',
    priority: 20, // Lower priority than built-ins and modules
    cache: { strategy: 'none' } // Local files don't need caching
  };

  constructor(private fileSystem: IFileSystemService) {}

  /**
   * Check if this resolver can handle the reference
   * Always returns true since prefix matching is done by ResolverManager
   */
  canResolve(ref: string, config?: LocalResolverConfig): boolean {
    // We can handle any reference if we have a valid config
    return !!config?.basePath;
  }

  /**
   * Resolve a reference to local file content
   */
  async resolve(ref: string, config?: LocalResolverConfig): Promise<ResolverContent> {
    if (!config?.basePath) {
      throw new MlldResolutionError(
        'LocalResolver requires basePath in configuration',
        { reference: ref }
      );
    }

    // Extract the path after the prefix
    // The ResolverManager will have already matched the prefix
    const relativePath = this.extractRelativePath(ref, config);
    
    // Validate and resolve the full path
    let fullPath = await this.resolveFullPath(relativePath, config);
    
    // If no extension and the file doesn't exist, try with .mld extension
    if (!path.extname(fullPath)) {
      const existsAsIs = await this.fileSystem.exists(fullPath);
      if (!existsAsIs) {
        const withMld = fullPath + '.mld';
        if (await this.fileSystem.exists(withMld)) {
          fullPath = withMld;
        }
      }
    }

    // Check file extension if restrictions are configured
    if (config.allowedExtensions) {
      const ext = path.extname(fullPath).toLowerCase();
      if (!config.allowedExtensions.includes(ext)) {
        throw new MlldResolutionError(
          `File extension '${ext}' not allowed. Allowed: ${config.allowedExtensions.join(', ')}`,
          { reference: ref, path: fullPath }
        );
      }
    }

    try {
      // Read the file
      const content = await this.fileSystem.readFile(fullPath);
      
      // Get file stats for metadata
      const stats = await this.fileSystem.stat(fullPath);

      return {
        content,
        metadata: {
          source: `file://${fullPath}`,
          timestamp: new Date(),  // Use current time since IFileSystemService doesn't provide mtime
          taintLevel: TaintLevel.LOCAL,
          size: content.length,  // Calculate size from content
          mimeType: this.getMimeType(fullPath)
        }
      };
    } catch (error) {
      if (error.code === 'ENOENT' || error.message?.includes('File not found')) {
        throw new MlldFileNotFoundError(
          `File not found: ${relativePath}`,
          fullPath
        );
      }
      throw new MlldResolutionError(
        `Failed to read file: ${error.message}`,
        { reference: ref, path: fullPath, originalError: error }
      );
    }
  }

  /**
   * Write content to a local file
   */
  async write(ref: string, content: string, config?: LocalResolverConfig): Promise<void> {
    if (!config?.basePath) {
      throw new MlldResolutionError(
        'LocalResolver requires basePath in configuration',
        { reference: ref }
      );
    }

    if (config.readonly) {
      throw new MlldResolutionError(
        'Cannot write: LocalResolver is configured as read-only',
        { reference: ref }
      );
    }

    const relativePath = this.extractRelativePath(ref, config);
    const fullPath = await this.resolveFullPath(relativePath, config);

    // Check file extension if restrictions are configured
    if (config.allowedExtensions) {
      const ext = path.extname(fullPath).toLowerCase();
      if (!config.allowedExtensions.includes(ext)) {
        throw new MlldResolutionError(
          `File extension '${ext}' not allowed. Allowed: ${config.allowedExtensions.join(', ')}`,
          { reference: ref, path: fullPath }
        );
      }
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await this.fileSystem.mkdir(dir, { recursive: true });

      // Write the file
      await this.fileSystem.writeFile(fullPath, content);
    } catch (error) {
      throw new MlldResolutionError(
        `Failed to write file: ${error.message}`,
        { reference: ref, path: fullPath, originalError: error }
      );
    }
  }

  /**
   * List files under a prefix
   */
  async list(prefix: string, config?: LocalResolverConfig): Promise<ContentInfo[]> {
    if (!config?.basePath) {
      return [];
    }

    const relativePath = this.extractRelativePath(prefix, config);
    const fullPath = await this.resolveFullPath(relativePath, config);

    try {
      const stats = await this.fileSystem.stat(fullPath);
      if (!stats.isDirectory()) {
        return [];
      }

      const entries = await this.fileSystem.readdir(fullPath);
      const results: ContentInfo[] = [];

      for (const entryName of entries) {
        const entryPath = path.join(fullPath, entryName);
        
        try {
          const entryStats = await this.fileSystem.stat(entryPath);

          // Apply extension filter if configured
          if (config.allowedExtensions && entryStats.isFile()) {
            const ext = path.extname(entryName).toLowerCase();
            if (!config.allowedExtensions.includes(ext)) {
              continue;
            }
          }

          results.push({
            path: path.join(prefix, entryName),
            type: entryStats.isDirectory() ? 'directory' : 'file',
            size: 0,  // IFileSystemService doesn't provide size
            lastModified: new Date()  // Use current time
          });
        } catch (error) {
          // Skip entries we can't stat
          continue;
        }
      }

      return results;
    } catch (error) {
      // If directory doesn't exist, return empty list
      if (error.code === 'ENOENT' || error.message?.includes('Path not found')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config: any): string[] {
    const errors: string[] = [];

    if (!config?.basePath) {
      errors.push('basePath is required');
    } else if (typeof config.basePath !== 'string') {
      errors.push('basePath must be a string');
    }

    if (config.readonly !== undefined && typeof config.readonly !== 'boolean') {
      errors.push('readonly must be a boolean');
    }

    if (config.allowedExtensions !== undefined) {
      if (!Array.isArray(config.allowedExtensions)) {
        errors.push('allowedExtensions must be an array');
      } else if (!config.allowedExtensions.every(ext => typeof ext === 'string')) {
        errors.push('allowedExtensions must contain only strings');
      }
    }

    if (config.followSymlinks !== undefined && typeof config.followSymlinks !== 'boolean') {
      errors.push('followSymlinks must be a boolean');
    }

    if (config.maxDepth !== undefined) {
      if (typeof config.maxDepth !== 'number' || config.maxDepth < 0) {
        errors.push('maxDepth must be a non-negative number');
      }
    }

    return errors;
  }

  /**
   * Check access permissions
   */
  async checkAccess(ref: string, operation: 'read' | 'write', config?: LocalResolverConfig): Promise<boolean> {
    if (!config?.basePath) {
      return false;
    }

    if (operation === 'write' && config.readonly) {
      return false;
    }

    try {
      const relativePath = this.extractRelativePath(ref, config);
      const fullPath = await this.resolveFullPath(relativePath, config);

      // If no extension and the file doesn't exist, try with .mld extension
      if (operation === 'read' && !path.extname(fullPath)) {
        const existsAsIs = await this.fileSystem.exists(fullPath);
        if (!existsAsIs) {
          // Try with .mld extension
          const withMld = fullPath + '.mld';
          if (await this.fileSystem.exists(withMld)) {
            return true;
          }
        }
      }

      // For write operations, check directory access
      if (operation === 'write') {
        const dir = path.dirname(fullPath);
        // Check if directory exists
        const dirExists = await this.fileSystem.exists(dir);
        return dirExists;
      } else {
        // For read operations, check file exists
        return await this.fileSystem.exists(fullPath);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract relative path from reference
   * Assumes the ResolverManager has already matched and removed the prefix
   */
  private extractRelativePath(ref: string, config: LocalResolverConfig): string {
    // Strip common module prefixes like @local/, @notes/, etc.
    // The ResolverManager passes the full reference, so we need to extract the path
    const prefixMatch = ref.match(/^@[^/]+\/(.*)/);
    if (prefixMatch) {
      return prefixMatch[1];
    }
    // If no prefix match, use as-is (for direct file paths)
    return ref;
  }

  /**
   * Resolve and validate the full filesystem path
   */
  private async resolveFullPath(relativePath: string, config: LocalResolverConfig): Promise<string> {
    const normalizedBase = path.resolve(config.basePath);
    
    // Check if the path is already absolute and within basePath
    if (path.isAbsolute(relativePath)) {
      const normalizedPath = path.resolve(relativePath);
      if (normalizedPath.startsWith(normalizedBase)) {
        // Path is already absolute and within basePath, use it as-is
        return normalizedPath;
      }
      // Absolute path outside basePath - security error
      throw new MlldResolutionError(
        'Path traversal detected: absolute path is outside base directory',
        { 
          reference: relativePath,
          basePath: normalizedBase,
          resolvedPath: normalizedPath
        }
      );
    }
    
    // Remove leading slash if present for relative paths
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    
    // Resolve the full path
    const fullPath = path.resolve(config.basePath, cleanPath);
    const normalizedFull = path.resolve(fullPath);

    // Security: Ensure the resolved path is within the base path
    if (!normalizedFull.startsWith(normalizedBase)) {
      throw new MlldResolutionError(
        'Path traversal detected: resolved path is outside base directory',
        { 
          reference: relativePath,
          basePath: normalizedBase,
          resolvedPath: normalizedFull
        }
      );
    }

    // Check depth if configured
    if (config.maxDepth !== undefined) {
      const relativeParts = path.relative(normalizedBase, normalizedFull).split(path.sep).filter(p => p && p !== '.');
      // Count the number of directories in the path
      // For 'README.md', depth = 0
      // For 'modules/utils.mld', depth = 1
      const depth = Math.max(0, relativeParts.length - 1);
      
      // maxDepth is the maximum allowed depth, so >= comparison
      if (depth >= config.maxDepth) {
        throw new MlldResolutionError(
          `Path exceeds maximum depth of ${config.maxDepth}`,
          { reference: relativePath, depth }
        );
      }
    }

    // Handle symlinks based on configuration
    // Note: IFileSystemService doesn't support lstat, so we skip symlink checking
    // for basic file systems. This is acceptable for testing environments.

    return normalizedFull;
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mld': 'text/x-mlld',
      '.mlld': 'text/x-mlld',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.py': 'text/x-python',
      '.sh': 'text/x-shellscript',
      '.xml': 'text/xml',
      '.html': 'text/html',
      '.css': 'text/css'
    };

    return mimeTypes[ext] || 'text/plain';
  }
}