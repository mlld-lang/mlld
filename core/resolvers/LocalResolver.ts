import * as path from 'path';
import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo,
  ResolverCapabilities,
  FuzzyMatchConfig
} from '@core/resolvers/types';
import { MlldFileNotFoundError } from '@core/errors';
import { ResolverError } from '@core/errors/ResolverError';
import { TaintLevel } from '@security/taint/TaintTracker';
import { IFileSystemService } from '@services/fs/IFileSystemService';
import { PathMatcher } from '@core/resolvers/utils/PathMatcher';

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

  /**
   * Fuzzy matching configuration
   */
  fuzzyMatch?: FuzzyMatchConfig;
}

/**
 * Local Resolver - maps prefixes to filesystem paths
 * Provides secure access to local files with path validation
 */
export class LocalResolver implements Resolver {
  name = 'LOCAL';
  description = 'Resolves modules from local filesystem paths';
  type: ResolverType = 'io';
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: true },
    contexts: { import: true, path: true, output: false },
    supportedContentTypes: ['module', 'data', 'text'],
    defaultContentType: 'text',
    priority: 20, // Lower priority than built-ins and modules
    cache: { strategy: 'none' } // Local files don't need caching
  };

  private pathMatcher: PathMatcher;

  constructor(private fileSystem: IFileSystemService) {
    this.pathMatcher = new PathMatcher(fileSystem);
  }

  /**
   * Check if this resolver can handle the reference
   * Always returns true since prefix matching is done by ResolverManager
   */
  canResolve(ref: string, config?: LocalResolverConfig): boolean {
    // We can handle any reference if we have a valid config
    // OR if the reference is an absolute path (for backwards compatibility)
    return !!config?.basePath || path.isAbsolute(ref);
  }

  /**
   * Resolve a reference to local file content
   */
  async resolve(ref: string, config?: LocalResolverConfig): Promise<ResolverContent> {
    // For absolute paths without config, use root as basePath for backwards compatibility
    if (!config?.basePath && !path.isAbsolute(ref)) {
      throw new ResolverError(
        'LocalResolver requires basePath in configuration for relative paths',
        { resolverName: 'LocalResolver', operation: 'resolve' }
      );
    }

    // Extract the path after the prefix
    // The ResolverManager will have already matched the prefix
    const relativePath = this.extractRelativePath(ref, config);
    
    // Quick check for .mld.md files (common module format)
    if (config?.basePath) {
      const mldMdPath = path.join(config.basePath, relativePath + '.mld.md');
      if (await this.fileSystem.exists(mldMdPath)) {
        const content = await this.fileSystem.readFile(mldMdPath, 'utf8');
        return {
          content,
          contentType: 'module',
          metadata: {
            source: `file://${mldMdPath}`,
            mimeType: 'text/x-mlld-module',
            size: Buffer.byteLength(content, 'utf8'),
            timestamp: new Date()
          }
        };
      }
    }
    
    // First check for path traversal attempts (security check before fuzzy matching)
    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
      // Validate through resolveFullPath which has security checks
      try {
        const securePath = await this.resolveFullPath(relativePath, config);
        // If it passes security checks, we can proceed
      } catch (error) {
        // Security error - re-throw it
        throw error;
      }
    }
    
    // Use fuzzy matching if enabled (default: true)
    const fuzzyConfig = config?.fuzzyMatch !== undefined ? config.fuzzyMatch : true;
    const fuzzyEnabled = typeof fuzzyConfig === 'boolean' ? fuzzyConfig : fuzzyConfig.enabled !== false;
    
    let fullPath: string;
    
    if (fuzzyEnabled && config?.basePath) {
      // Try fuzzy matching
      const matchResult = await this.pathMatcher.findMatch(
        relativePath,
        config.basePath,
        typeof fuzzyConfig === 'object' ? fuzzyConfig : undefined,
        config.maxDepth
      );
      
      if (matchResult.candidates && matchResult.candidates.length > 1) {
        // Ambiguous match - throw error with all candidates
        const candidatePaths = matchResult.candidates
          .map(c => `  - ${path.relative(config.basePath, c.path)} (${c.matchType} match)`)
          .join('\n');
        
        throw new ResolverError(
          `Ambiguous path '${relativePath}' matches multiple files:\n${candidatePaths}\n\nPlease use a more specific path.`,
          { resolverName: 'LocalResolver', reference: ref, operation: 'resolve' }
        );
      }
      
      if (matchResult.path) {
        fullPath = matchResult.path;
      } else {
        // No fuzzy match found - try with extensions
        fullPath = await this.resolveFullPath(relativePath, config);
        
        // If no extension and the file doesn't exist, try with .mlld.md, .mld, or .md extensions
        if (!path.extname(fullPath)) {
          const existsAsIs = await this.fileSystem.exists(fullPath);
          if (!existsAsIs) {
            // Try with extensions using fuzzy matching
            const extensions = ['.mlld.md', '.mld', '.md'];
            let foundWithExtension = false;
            
            for (const ext of extensions) {
              const pathWithExt = relativePath + ext;
              const extMatchResult = await this.pathMatcher.findMatch(
                pathWithExt,
                config.basePath,
                typeof fuzzyConfig === 'object' ? fuzzyConfig : undefined,
                config.maxDepth
              );
              
              if (extMatchResult.path) {
                fullPath = extMatchResult.path;
                foundWithExtension = true;
                break;
              }
            }
            
            if (!foundWithExtension && matchResult.suggestions && matchResult.suggestions.length > 0) {
              // Provide helpful suggestions
              const suggestions = matchResult.suggestions
                .slice(0, 3)
                .map(s => `  - ${s}`)
                .join('\n');
              
              throw new MlldFileNotFoundError(
                `File not found: ${relativePath}\n\nDid you mean:\n${suggestions}`,
                fullPath
              );
            }
          }
        }
      }
    } else {
      // Fuzzy matching disabled - use original logic
      fullPath = await this.resolveFullPath(relativePath, config);
      
      // If no extension and the file doesn't exist, try with .mlld.md, .mld, or .md extensions
      if (!path.extname(fullPath)) {
        const existsAsIs = await this.fileSystem.exists(fullPath);
        if (!existsAsIs) {
          // Try .mlld.md first (mlld module format)
          const withMlldMd = fullPath + '.mlld.md';
          if (await this.fileSystem.exists(withMlldMd)) {
            fullPath = withMlldMd;
          } else {
            // Try .mld as fallback
            const withMld = fullPath + '.mld';
            if (await this.fileSystem.exists(withMld)) {
              fullPath = withMld;
            } else {
              // Try .md as final fallback
              const withMd = fullPath + '.md';
              if (await this.fileSystem.exists(withMd)) {
                fullPath = withMd;
              }
            }
          }
        }
      }
    }

    // Check file extension if restrictions are configured
    if (config.allowedExtensions) {
      const ext = path.extname(fullPath).toLowerCase();
      if (!config.allowedExtensions.includes(ext)) {
        throw new ResolverError(
          `File extension '${ext}' not allowed. Allowed: ${config.allowedExtensions.join(', ')}`,
          { resolverName: 'LocalResolver', reference: ref, operation: 'resolve' }
        );
      }
    }

    try {
      // Read the file
      const content = await this.fileSystem.readFile(fullPath);
      
      // Get file stats for metadata
      const stats = await this.fileSystem.stat(fullPath);
      
      // Detect content type
      const contentType = await this.detectContentType(fullPath, content);

      return {
        content,
        contentType,
        metadata: {
          source: `file://${fullPath}`,
          timestamp: new Date(),  // Use current time since IFileSystemService doesn't provide mtime
          taintLevel: (TaintLevel as any).LOCAL,
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
      throw ResolverError.resolutionFailed(
        'LocalResolver',
        ref,
        error as Error
      );
    }
  }

  /**
   * Write content to a local file
   */
  async write(ref: string, content: string, config?: LocalResolverConfig): Promise<void> {
    if (!config?.basePath) {
      throw new ResolverError(
        'LocalResolver requires basePath in configuration',
        { resolverName: 'LocalResolver', operation: 'write' }
      );
    }

    if (config.readonly) {
      throw new ResolverError(
        'Cannot write: LocalResolver is configured as read-only',
        { resolverName: 'LocalResolver', operation: 'write', reference: ref }
      );
    }

    const relativePath = this.extractRelativePath(ref, config);
    const fullPath = await this.resolveFullPath(relativePath, config);

    // Check file extension if restrictions are configured
    if (config.allowedExtensions) {
      const ext = path.extname(fullPath).toLowerCase();
      if (!config.allowedExtensions.includes(ext)) {
        throw new ResolverError(
          `File extension '${ext}' not allowed. Allowed: ${config.allowedExtensions.join(', ')}`,
          { resolverName: 'LocalResolver', reference: ref, operation: 'resolve' }
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
      throw new ResolverError(
        `Failed to write file: ${error.message}`,
        { resolverName: 'LocalResolver', reference: ref, operation: 'write', originalError: error as Error }
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
    
    // Use fuzzy matching if enabled (default: true)
    const fuzzyConfig = config?.fuzzyMatch !== undefined ? config.fuzzyMatch : true;
    const fuzzyEnabled = typeof fuzzyConfig === 'boolean' ? fuzzyConfig : fuzzyConfig.enabled !== false;
    
    let fullPath: string;
    
    if (fuzzyEnabled) {
      // Try to find the directory with fuzzy matching
      const matchResult = await this.pathMatcher.findMatch(
        relativePath,
        config.basePath,
        typeof fuzzyConfig === 'object' ? fuzzyConfig : undefined,
        config.maxDepth
      );
      
      if (!matchResult.path) {
        return [];
      }
      
      fullPath = matchResult.path;
    } else {
      fullPath = await this.resolveFullPath(relativePath, config);
    }

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
      
      // Quick check for .mld.md files (common module format)
      const mldMdPath = path.join(config.basePath, relativePath + '.mld.md');
      if (await this.fileSystem.exists(mldMdPath)) {
        return true;
      }
      
      // Use fuzzy matching if enabled (default: true)
      const fuzzyConfig = config?.fuzzyMatch !== undefined ? config.fuzzyMatch : true;
      const fuzzyEnabled = typeof fuzzyConfig === 'boolean' ? fuzzyConfig : fuzzyConfig.enabled !== false;
      
      if (fuzzyEnabled && operation === 'read') {
        // Try fuzzy matching for read operations
        const matchResult = await this.pathMatcher.findMatch(
          relativePath,
          config.basePath,
          typeof fuzzyConfig === 'object' ? fuzzyConfig : undefined,
          config.maxDepth
        );
        
        if (matchResult.path) {
          return true;
        }
        
        // Try with extensions
        const extensions = ['.mlld.md', '.mld', '.md'];
        for (const ext of extensions) {
          const pathWithExt = relativePath + ext;
          const extMatchResult = await this.pathMatcher.findMatch(
            pathWithExt,
            config.basePath,
            typeof fuzzyConfig === 'object' ? fuzzyConfig : undefined,
            config.maxDepth
          );
          
          if (extMatchResult.path) {
            return true;
          }
        }
        
        return false;
      } else {
        // Fuzzy matching disabled or write operation - use original logic
        const fullPath = await this.resolveFullPath(relativePath, config);

        // If no extension and the file doesn't exist, try with .mlld.md, .mld, or .md extensions
        if (operation === 'read' && !path.extname(fullPath)) {
          const existsAsIs = await this.fileSystem.exists(fullPath);
          if (!existsAsIs) {
            // Try .mlld.md first (mlld module format)
            const withMlldMd = fullPath + '.mlld.md';
            if (await this.fileSystem.exists(withMlldMd)) {
              return true;
            }
            // Try .mld as fallback
            const withMld = fullPath + '.mld';
            if (await this.fileSystem.exists(withMld)) {
              return true;
            }
            // Try .md as final fallback
            const withMd = fullPath + '.md';
            if (await this.fileSystem.exists(withMd)) {
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
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract relative path from reference
   * Assumes the ResolverManager has already matched and removed the prefix
   */
  private extractRelativePath(ref: string, config: LocalResolverConfig | undefined): string {
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
  private async resolveFullPath(relativePath: string, config: LocalResolverConfig | undefined): Promise<string> {
    // If no config and path is absolute, use root as base (for backwards compatibility)
    const basePath = config?.basePath || '/';
    const normalizedBase = path.resolve(basePath);
    
    // Check if the path is already absolute and within basePath
    if (path.isAbsolute(relativePath)) {
      const normalizedPath = path.resolve(relativePath);
      if (normalizedPath.startsWith(normalizedBase)) {
        // Path is already absolute and within basePath, use it as-is
        return normalizedPath;
      }
      // Absolute path outside basePath - security error
      throw new ResolverError(
        'Path traversal detected: absolute path is outside base directory',
        { 
          resolverName: 'LocalResolver',
          reference: relativePath,
          operation: 'resolve'
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
      throw new ResolverError(
        'Path traversal detected: resolved path is outside base directory',
        { 
          resolverName: 'LocalResolver',
          reference: relativePath,
          operation: 'resolve'
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
        throw new ResolverError(
          `Path exceeds maximum depth of ${config.maxDepth}`,
          { resolverName: 'LocalResolver', reference: relativePath, operation: 'resolve' }
        );
      }
    }

    // Handle symlinks based on configuration
    // Note: IFileSystemService doesn't support lstat, so we skip symlink checking
    // for basic file systems. This is acceptable for testing environments.

    return normalizedFull;
  }

  /**
   * Detect content type based on file extension and content
   */
  private async detectContentType(filePath: string, content: string): Promise<'module' | 'data' | 'text'> {
    // Check file extension
    // Only .mlld.md files are formal modules
    if (filePath.endsWith('.mlld.md')) {
      return 'module';
    }
    if (filePath.endsWith('.json')) {
      return 'data';
    }
    // Note: .mld and .mlld files are treated as 'text' since they're not formal modules
    // They can still be imported, but they're not packaged modules
    
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