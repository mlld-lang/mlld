import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo,
  ResolverCapabilities
} from '@core/resolvers/types';
import { MlldResolutionError } from '@core/errors';
import { TaintLevel } from '@security/taint/TaintTracker';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { logger } from '@core/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// GitHub API response types
interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  size?: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url?: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  content?: string;
  encoding?: string;
}

interface GitHubRepoInfo {
  default_branch: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    type: string;
  };
}

/**
 * Configuration for GitHubResolver
 */
export interface GitHubResolverConfig {
  /**
   * GitHub personal access token for authentication
   * @deprecated Use 'mlld auth login' to store tokens securely instead
   */
  token?: string;

  /**
   * Repository owner and name (e.g., "mlld-lang/mlld")
   */
  repository: string;

  /**
   * Branch or tag to use (defaults to main/master)
   */
  branch?: string;

  /**
   * Base path within the repository
   */
  basePath?: string;

  /**
   * Whether to use raw content API (faster but limited to 1MB files)
   */
  useRawApi?: boolean;

  /**
   * Cache timeout in milliseconds
   */
  cacheTimeout?: number;

  /**
   * The prefix used to reference this resolver (e.g., "@private/")
   * Used for helpful error messages
   */
  prefix?: string;

  /**
   * Resolution context (import, path, variable)
   */
  context?: string;
}

/**
 * GitHub Resolver - provides access to GitHub repository contents
 * Supports both public and private repositories (with token)
 */
export class GitHubResolver implements Resolver {
  name = 'GITHUB';
  description = 'Resolves modules from GitHub repositories';
  type: ResolverType = 'input';

  constructor() {
    this.authService = GitHubAuthService.getInstance();
  }
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: true },
    contexts: { import: true, path: true, output: false },
    supportedContentTypes: ['module', 'data', 'text'],
    defaultContentType: 'text',
    priority: 20, // Same as other file resolvers
    cache: { 
      strategy: 'persistent',
      ttl: { duration: 300 } // 5 minutes
    }
  };

  private readonly cache: Map<string, { content: string; timestamp: number; etag?: string }> = new Map();
  private readonly defaultCacheTimeout = 300000; // 5 minutes
  private authService: GitHubAuthService;

  /**
   * Check if this resolver can handle the reference
   */
  canResolve(ref: string, config?: GitHubResolverConfig): boolean {
    // We can handle any reference if we have a valid repository config
    return !!config?.repository;
  }

  /**
   * Resolve a reference to GitHub content
   */
  async resolve(ref: string, config?: GitHubResolverConfig): Promise<ResolverContent> {
    if (!config?.repository) {
      throw new MlldResolutionError(
        'GitHubResolver requires repository in configuration',
        { reference: ref }
      );
    }

    // Parse repository owner and name
    const [owner, repo] = config.repository.split('/');
    if (!owner || !repo) {
      throw new MlldResolutionError(
        'Invalid repository format. Expected "owner/repo"',
        { reference: ref, repository: config.repository }
      );
    }

    // Build the path within the repository
    const path = this.buildPath(ref, config);
    
    // Check cache first
    const cacheKey = `${config.repository}:${config.branch || 'default'}:${path}`;
    const cached = this.getCached(cacheKey, config.cacheTimeout);
    if (cached) {
      const contentType = await this.detectContentType(path, cached.content);
      return {
        content: cached.content,
        contentType,
        metadata: {
          source: `github://${config.repository}/${path}`,
          timestamp: new Date(),
          taintLevel: (await this.getAuthToken(config)) ? (TaintLevel as any).PRIVATE : (TaintLevel as any).PUBLIC,
          author: owner
        }
      };
    }

    try {
      // Get authentication token
      const token = await this.getAuthToken(config);
      
      // Fetch from GitHub
      const { content, etag } = await this.fetchFromGitHub(owner, repo, path, config, cached?.etag, token);
      
      // Update cache
      this.cache.set(cacheKey, {
        content,
        timestamp: Date.now(),
        etag
      });

      const contentType = await this.detectContentType(path, content);
      return {
        content,
        contentType,
        metadata: {
          source: `github://${config.repository}/${path}`,
          timestamp: new Date(),
          taintLevel: token ? (TaintLevel as any).PRIVATE : (TaintLevel as any).PUBLIC,
          author: owner,
          mimeType: this.getMimeType(path)
        }
      };
    } catch (error) {
      const err = error as { status?: number; message?: string };
      if (err.status === 404) {
        // Check if the file exists locally
        const localPath = this.getLocalPath(ref, config);
        const localExists = localPath && fs.existsSync(localPath);
        
        if (localExists) {
          // Extract the prefix from the original reference
          const prefix = config.prefix || '@private/';
          
          logger.debug(`GitHubResolver: Module ${ref} not found in repo, but local version exists at ${localPath}`);
          
          throw new MlldResolutionError(
            `Module '${prefix}${ref}' not found in repository ${config.repository}.\n` +
            `However, a local version exists at: ${localPath}\n\n` +
            `To test locally before publishing:\n` +
            `  @import { something } from @local/${ref}\n\n` +
            `Ready to publish? Run:\n` +
            `  mlld publish ${localPath}`,
            { 
              code: 'MODULE_NOT_FOUND_BUT_LOCAL_EXISTS',
              details: { 
                reference: ref, 
                repository: config.repository, 
                path, 
                hasLocal: true, 
                localPath 
              }
            }
          );
        } else {
          throw new MlldResolutionError(
            `File not found in repository: ${path}`,
            { 
              code: 'FILE_NOT_FOUND', 
              details: { reference: ref, repository: config.repository, path } 
            }
          );
        }
      }
      if (err.status === 401 || err.status === 403) {
        throw new MlldResolutionError(
          `GitHub authentication required. Run 'mlld auth login' to authenticate`,
          { reference: ref, repository: config.repository, path }
        );
      }
      throw new MlldResolutionError(
        `Failed to fetch from GitHub: ${err.message || 'Unknown error'}`,
        { 
          reference: ref, 
          repository: config.repository,
          path,
          originalError: error
        }
      );
    }
  }

  /**
   * List files in a GitHub directory
   */
  async list(prefix: string, config?: GitHubResolverConfig): Promise<ContentInfo[]> {
    if (!config?.repository) {
      return [];
    }

    const [owner, repo] = config.repository.split('/');
    if (!owner || !repo) {
      return [];
    }

    const path = this.buildPath(prefix, config);
    const token = await this.getAuthToken(config);
    const branch = await this.resolveBranch(owner, repo, config, token);

    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await this.githubFetch(url, token);
      
      if (!response.ok) {
        return [];
      }

      const items = await response.json() as GitHubContentItem[];
      if (!Array.isArray(items)) {
        return [];
      }

      return items.map(item => ({
        path: `${prefix}/${item.name}`,
        type: item.type === 'dir' ? 'directory' : 'file' as const,
        size: item.size,
        lastModified: new Date(item.sha) // Using SHA as a proxy for last modified
      }));
    } catch {
      return [];
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config: unknown): string[] {
    const errors: string[] = [];
    
    // Type guard for config
    if (!config || typeof config !== 'object') {
      errors.push('config must be an object');
      return errors;
    }
    
    const cfg = config as Record<string, unknown>;

    if (!cfg.repository) {
      errors.push('repository is required');
    } else if (typeof cfg.repository !== 'string') {
      errors.push('repository must be a string');
    } else if (!cfg.repository.includes('/')) {
      errors.push('repository must be in format "owner/repo"');
    }

    if (cfg.token !== undefined && typeof cfg.token !== 'string') {
      errors.push('token must be a string');
    }

    if (cfg.branch !== undefined && typeof cfg.branch !== 'string') {
      errors.push('branch must be a string');
    }

    if (cfg.basePath !== undefined && typeof cfg.basePath !== 'string') {
      errors.push('basePath must be a string');
    }

    if (cfg.useRawApi !== undefined && typeof cfg.useRawApi !== 'boolean') {
      errors.push('useRawApi must be a boolean');
    }

    if (cfg.cacheTimeout !== undefined) {
      if (typeof cfg.cacheTimeout !== 'number' || cfg.cacheTimeout < 0) {
        errors.push('cacheTimeout must be a non-negative number');
      }
    }

    return errors;
  }

  /**
   * Check access - depends on whether repository is public/private
   */
  async checkAccess(ref: string, operation: 'read' | 'write', config?: GitHubResolverConfig): Promise<boolean> {
    if (operation === 'write') {
      return false; // GitHub resolver is read-only
    }

    if (!config?.repository) {
      return false;
    }

    // Get authentication token from auth service or config
    const token = await this.getAuthToken(config);
    
    // For private repos, we need a token
    if (token) {
      return true;
    }

    // For public repos, check if accessible
    const [owner, repo] = config.repository.split('/');
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get authentication token from auth service or config fallback
   */
  private async getAuthToken(config?: GitHubResolverConfig): Promise<string | null> {
    try {
      // First try to get token from auth service
      const authToken = await this.authService.getStoredToken();
      if (authToken) {
        return authToken;
      }
    } catch {
      // Auth service failed, continue to fallback
    }

    // Fall back to config token (deprecated)
    if (config?.token) {
      return config.token;
    }

    // Fall back to environment variable
    if (process.env.GITHUB_TOKEN) {
      return process.env.GITHUB_TOKEN;
    }

    return null;
  }

  /**
   * Build the full path within the repository
   */
  private buildPath(ref: string, config: GitHubResolverConfig): string {
    const parts: string[] = [];
    
    if (config.basePath) {
      parts.push(config.basePath.replace(/^\/|\/$/g, ''));
    }
    
    if (ref) {
      let modulePath = ref.replace(/^\/|\/$/g, '');
      
      // Auto-append .mlld.md extension if no extension is provided
      if (modulePath && !modulePath.includes('.')) {
        modulePath += '.mlld.md';
      }
      
      parts.push(modulePath);
    }
    
    return parts.filter(p => p.length > 0).join('/');
  }

  /**
   * Get cached content if available
   */
  private getCached(
    key: string, 
    timeout?: number
  ): { content: string; etag?: string } | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const maxAge = timeout || this.defaultCacheTimeout;
    if (Date.now() - cached.timestamp > maxAge) {
      this.cache.delete(key);
      return null;
    }

    return { content: cached.content, etag: cached.etag };
  }

  /**
   * Fetch content from GitHub
   */
  private async fetchFromGitHub(
    owner: string,
    repo: string,
    path: string,
    config: GitHubResolverConfig,
    etag?: string,
    token?: string | null
  ): Promise<{ content: string; etag?: string }> {
    const branch = await this.resolveBranch(owner, repo, config, token);

    // Use raw API for better performance if enabled
    if (config.useRawApi !== false) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      const headers: HeadersInit = {};
      
      if (token) {
        headers['Authorization'] = `token ${token}`;
      }
      
      if (etag) {
        headers['If-None-Match'] = etag;
      }

      const response = await fetch(url, { headers });
      
      if (response.status === 304) {
        // Not modified, use cache
        const cached = this.cache.get(`${config.repository}:${branch}:${path}`);
        if (cached) {
          return { content: cached.content, etag: cached.etag };
        }
      }

      if (!response.ok) {
        const error = new Error(`GitHub API error: ${response.statusText}`) as Error & { status: number };
        error.status = response.status;
        throw error;
      }

      return {
        content: await response.text(),
        etag: response.headers.get('etag') || undefined
      };
    }

    // Fall back to contents API
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const response = await this.githubFetch(url, token, etag);

    if (response.status === 304) {
      // Not modified, use cache
      const cached = this.cache.get(`${config.repository}:${branch}:${path}`);
      if (cached) {
        return { content: cached.content, etag: cached.etag };
      }
    }

    if (!response.ok) {
      const error = new Error(`GitHub API error: ${response.statusText}`) as Error & { status: number };
      error.status = response.status;
      throw error;
    }

    const data = await response.json() as GitHubContentItem;
    
    if (data.type !== 'file') {
      throw new Error(`Path is not a file: ${path}`);
    }
    
    if (!data.content) {
      throw new Error(`No content found for file: ${path}`);
    }

    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    
    return {
      content,
      etag: response.headers.get('etag') || undefined
    };
  }

  /**
   * Resolve the branch to use
   */
  private async resolveBranch(
    owner: string,
    repo: string,
    config: GitHubResolverConfig,
    token?: string | null
  ): Promise<string> {
    if (config.branch) {
      return config.branch;
    }

    // Get default branch from repo info
    const cacheKey = `${owner}/${repo}:default-branch`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 86400000) { // 24 hours
      return cached.content;
    }

    try {
      const response = await this.githubFetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        token
      );
      
      if (response.ok) {
        const data = await response.json() as GitHubRepoInfo;
        const defaultBranch = data.default_branch || 'main';
        
        this.cache.set(cacheKey, {
          content: defaultBranch,
          timestamp: Date.now()
        });
        
        return defaultBranch;
      }
    } catch {
      // Fall through to default
    }

    return 'main';
  }

  /**
   * Make a GitHub API request with proper headers
   */
  private async githubFetch(
    url: string,
    token?: string,
    etag?: string
  ): Promise<Response> {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'mlld-resolver'
    };

    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    if (etag) {
      headers['If-None-Match'] = etag;
    }

    return fetch(url, { headers });
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'mld': 'text/x-mlld',
      'mlld': 'text/x-mlld',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'json': 'application/json',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',
      'js': 'text/javascript',
      'ts': 'text/typescript',
      'py': 'text/x-python',
      'sh': 'text/x-shellscript'
    };

    return mimeTypes[ext || ''] || 'text/plain';
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
      ['text', 'data', 'exec', 'path'].includes(node.kind)
    );
  }

  /**
   * Get the local path where this module might exist
   */
  private getLocalPath(ref: string, config: GitHubResolverConfig): string | null {
    if (!config.basePath) return null;
    
    // Build the same path that would be used in the repository
    const modulePath = this.buildPath(ref, config);
    
    // Check relative to current working directory
    return path.join(process.cwd(), modulePath);
  }
}