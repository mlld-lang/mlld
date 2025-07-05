import { StorageAdapter, MlldModuleSource, StorageOptions, ParsedReference } from '../types';
import { MlldImportError } from '@core/errors';

// GitHub Contents API Types (from GitHubResolver)
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
 * Type guard for GitHub content response
 */
function isGitHubContentItem(obj: unknown): obj is GitHubContentItem {
  return typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'path' in obj &&
    'sha' in obj &&
    'type' in obj &&
    typeof (obj as GitHubContentItem).name === 'string' &&
    typeof (obj as GitHubContentItem).type === 'string';
}

/**
 * Type guard for GitHub repo info
 */
function isGitHubRepoInfo(obj: unknown): obj is GitHubRepoInfo {
  return typeof obj === 'object' &&
    obj !== null &&
    'default_branch' in obj &&
    'full_name' in obj &&
    'owner' in obj &&
    typeof (obj as GitHubRepoInfo).default_branch === 'string';
}

/**
 * Adapter for GitHub Repository storage
 */
export class RepositoryAdapter implements StorageAdapter {
  private readonly repoUrlPattern = /^mlld:\/\/github\/([^/]+)\/([^/]+)\/(.+)$/;
  private readonly httpRepoPattern = /github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+\.mlld?)$/;
  private readonly rawUrlPattern = /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+\.mlld?)$/;

  canHandle(reference: string): boolean {
    return this.repoUrlPattern.test(reference) ||
           this.httpRepoPattern.test(reference) ||
           this.rawUrlPattern.test(reference);
  }

  async fetch(reference: string, options?: StorageOptions): Promise<MlldModuleSource> {
    const parsed = this.parseReference(reference);
    const { owner, repo, path } = parsed.parts;
    const branch = options?.revision || parsed.parts.branch || await this.getDefaultBranch(owner, repo, options);

    // Try raw API first (faster, no base64 decoding needed)
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    
    try {
      const response = await fetch(rawUrl, {
        headers: this.buildHeaders(options?.token),
        signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
      });

      if (response.ok) {
        const content = await response.text();
        
        // Get commit info for metadata
        const commitInfo = await this.getLatestCommit(owner, repo, branch, path, options);
        
        return {
          content,
          metadata: {
            provider: 'github-repo',
            author: owner,
            revision: commitInfo.sha,
            sourceUrl: `https://github.com/${owner}/${repo}/blob/${branch}/${path}`,
            immutableUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${commitInfo.sha}/${path}`,
            timestamp: new Date(commitInfo.date),
            path,
            extra: {
              repository: `${owner}/${repo}`,
              branch,
              committer: commitInfo.committer
            }
          }
        };
      }
    } catch (error) {
      // Fall through to Contents API
    }

    // Fall back to Contents API
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const response = await fetch(apiUrl, {
      headers: this.buildHeaders(options?.token),
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
    });

    if (!response.ok) {
      throw new MlldImportError(
        `Failed to fetch from repository: ${response.statusText}`,
        { reference, status: response.status }
      );
    }

    const data = await response.json() as unknown;
    
    if (!isGitHubContentItem(data)) {
      throw new MlldImportError(
        'Invalid response from GitHub Contents API',
        { reference }
      );
    }

    if (data.type !== 'file') {
      throw new MlldImportError(
        `Path is not a file: ${path}`,
        { reference, type: data.type }
      );
    }

    if (!data.content) {
      throw new MlldImportError(
        `No content found for file: ${path}`,
        { reference }
      );
    }

    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf8');

    return {
      content,
      metadata: {
        provider: 'github-repo',
        author: owner,
        revision: data.sha,
        sourceUrl: data.html_url,
        immutableUrl: data.download_url || rawUrl.replace(branch, data.sha),
        path,
        extra: {
          repository: `${owner}/${repo}`,
          branch,
          size: data.size
        }
      }
    };
  }

  validateResponse(data: unknown): boolean {
    return isGitHubContentItem(data) || isGitHubRepoInfo(data);
  }

  getCacheKey(reference: string): string {
    const parsed = this.parseReference(reference);
    const { owner, repo, path } = parsed.parts;
    return `repo:${owner}:${repo}:${path}`;
  }

  private parseReference(reference: string): ParsedReference {
    // Try mlld:// format
    let match = reference.match(this.repoUrlPattern);
    if (match) {
      return {
        provider: 'github-repo',
        parts: {
          owner: match[1],
          repo: match[2],
          path: match[3]
        },
        raw: reference
      };
    }

    // Try GitHub web URL
    match = reference.match(this.httpRepoPattern);
    if (match) {
      return {
        provider: 'github-repo',
        parts: {
          owner: match[1],
          repo: match[2],
          branch: match[3],
          path: match[4]
        },
        raw: reference
      };
    }

    // Try raw URL
    match = reference.match(this.rawUrlPattern);
    if (match) {
      return {
        provider: 'github-repo',
        parts: {
          owner: match[1],
          repo: match[2],
          branch: match[3],
          path: match[4]
        },
        raw: reference
      };
    }

    throw new MlldImportError(
      'Invalid repository reference format',
      { reference }
    );
  }

  private async getDefaultBranch(owner: string, repo: string, options?: StorageOptions): Promise<string> {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: this.buildHeaders(options?.token),
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
    });

    if (!response.ok) {
      return 'main'; // Fallback
    }

    const data = await response.json() as unknown;
    if (!isGitHubRepoInfo(data)) {
      return 'main'; // Fallback
    }

    return data.default_branch;
  }

  private async getLatestCommit(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    options?: StorageOptions
  ): Promise<{ sha: string; date: string; committer: string }> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?path=${path}&sha=${branch}&per_page=1`,
        {
          headers: this.buildHeaders(options?.token),
          signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
        }
      );

      if (response.ok) {
        const commits = await response.json() as unknown;
        if (Array.isArray(commits) && commits.length > 0) {
          const commit = commits[0] as {
            sha: string;
            commit: {
              author: {
                date: string;
                name: string;
              };
            };
          };
          return {
            sha: commit.sha,
            date: commit.commit.author.date,
            committer: commit.commit.author.name
          };
        }
      }
    } catch {
      // Fall through to defaults
    }

    // Fallback if commit info unavailable
    return {
      sha: branch,
      date: new Date().toISOString(),
      committer: 'unknown'
    };
  }

  private buildHeaders(token?: string): HeadersInit {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'mlld-resolver'
    };

    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    return headers;
  }
}