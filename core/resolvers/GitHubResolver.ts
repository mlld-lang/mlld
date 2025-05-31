import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo
} from '@core/resolvers/types';
import { MlldResolutionError } from '@core/errors';
import { TaintLevel } from '@security/taint/TaintTracker';

/**
 * Configuration for GitHubResolver
 */
export interface GitHubResolverConfig {
  /**
   * GitHub personal access token for authentication
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
}

/**
 * GitHub Resolver - provides access to GitHub repository contents
 * Supports both public and private repositories (with token)
 */
export class GitHubResolver implements Resolver {
  name = 'github';
  description = 'Resolves modules from GitHub repositories';
  type: ResolverType = 'input';

  private readonly cache: Map<string, { content: string; timestamp: number; etag?: string }> = new Map();
  private readonly defaultCacheTimeout = 300000; // 5 minutes

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
      return {
        content: cached.content,
        metadata: {
          source: `github://${config.repository}/${path}`,
          timestamp: new Date(),
          taintLevel: config.token ? TaintLevel.PRIVATE : TaintLevel.PUBLIC,
          author: owner
        }
      };
    }

    try {
      // Fetch from GitHub
      const { content, etag } = await this.fetchFromGitHub(owner, repo, path, config, cached?.etag);
      
      // Update cache
      this.cache.set(cacheKey, {
        content,
        timestamp: Date.now(),
        etag
      });

      return {
        content,
        metadata: {
          source: `github://${config.repository}/${path}`,
          timestamp: new Date(),
          taintLevel: config.token ? TaintLevel.PRIVATE : TaintLevel.PUBLIC,
          author: owner,
          mimeType: this.getMimeType(path)
        }
      };
    } catch (error) {
      if (error.status === 404) {
        throw new MlldResolutionError(
          `File not found in repository: ${path}`,
          { reference: ref, repository: config.repository, path }
        );
      }
      throw new MlldResolutionError(
        `Failed to fetch from GitHub: ${error.message}`,
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
    const branch = await this.resolveBranch(owner, repo, config);

    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await this.githubFetch(url, config.token);
      
      if (!response.ok) {
        return [];
      }

      const items = await response.json();
      if (!Array.isArray(items)) {
        return [];
      }

      return items.map(item => ({
        path: `${prefix}/${item.name}`,
        type: item.type === 'dir' ? 'directory' : 'file',
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
  validateConfig(config: any): string[] {
    const errors: string[] = [];

    if (!config?.repository) {
      errors.push('repository is required');
    } else if (typeof config.repository !== 'string') {
      errors.push('repository must be a string');
    } else if (!config.repository.includes('/')) {
      errors.push('repository must be in format "owner/repo"');
    }

    if (config.token !== undefined && typeof config.token !== 'string') {
      errors.push('token must be a string');
    }

    if (config.branch !== undefined && typeof config.branch !== 'string') {
      errors.push('branch must be a string');
    }

    if (config.basePath !== undefined && typeof config.basePath !== 'string') {
      errors.push('basePath must be a string');
    }

    if (config.useRawApi !== undefined && typeof config.useRawApi !== 'boolean') {
      errors.push('useRawApi must be a boolean');
    }

    if (config.cacheTimeout !== undefined) {
      if (typeof config.cacheTimeout !== 'number' || config.cacheTimeout < 0) {
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

    // For private repos, we need a token
    if (config.token) {
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
   * Build the full path within the repository
   */
  private buildPath(ref: string, config: GitHubResolverConfig): string {
    const parts: string[] = [];
    
    if (config.basePath) {
      parts.push(config.basePath.replace(/^\/|\/$/g, ''));
    }
    
    if (ref) {
      parts.push(ref.replace(/^\/|\/$/g, ''));
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
    etag?: string
  ): Promise<{ content: string; etag?: string }> {
    const branch = await this.resolveBranch(owner, repo, config);

    // Use raw API for better performance if enabled
    if (config.useRawApi !== false) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      const headers: HeadersInit = {};
      
      if (config.token) {
        headers['Authorization'] = `token ${config.token}`;
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
        const error = new Error(`GitHub API error: ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      return {
        content: await response.text(),
        etag: response.headers.get('etag') || undefined
      };
    }

    // Fall back to contents API
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const response = await this.githubFetch(url, config.token, etag);

    if (response.status === 304) {
      // Not modified, use cache
      const cached = this.cache.get(`${config.repository}:${branch}:${path}`);
      if (cached) {
        return { content: cached.content, etag: cached.etag };
      }
    }

    if (!response.ok) {
      const error = new Error(`GitHub API error: ${response.statusText}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    
    if (data.type !== 'file') {
      throw new Error(`Path is not a file: ${path}`);
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
    config: GitHubResolverConfig
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
        config.token
      );
      
      if (response.ok) {
        const data = await response.json();
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
}