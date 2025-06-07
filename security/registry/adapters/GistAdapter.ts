import { StorageAdapter, MlldModuleSource, StorageOptions, ParsedReference } from '../types';
import { MlldImportError } from '@core/errors';

// GitHub Gist API Types (as we defined in RegistryClient)
interface GistFile {
  filename: string;
  type: string;
  language: string | null;
  raw_url: string;
  size: number;
  truncated: boolean;
  content: string;
}

interface GistHistory {
  version: string;
  committed_at: string;
  change_status: {
    total: number;
    additions: number;
    deletions: number;
  };
  url: string;
}

interface GistResponse {
  id: string;
  html_url: string;
  files: Record<string, GistFile>;
  history: GistHistory[];
  created_at: string;
  updated_at: string;
  description: string;
  owner: {
    login: string;
    id: number;
  };
}

/**
 * Type guard for Gist response validation
 */
function isGistResponse(obj: unknown): obj is GistResponse {
  return typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'files' in obj &&
    'history' in obj &&
    Array.isArray((obj as GistResponse).history) &&
    (obj as GistResponse).history.length > 0 &&
    typeof (obj as GistResponse).history[0].version === 'string';
}

/**
 * Adapter for GitHub Gist storage
 */
export class GistAdapter implements StorageAdapter {
  private readonly gistUrlPattern = /^mlld:\/\/gist\/([^/]+)\/([a-f0-9]+)$/;
  private readonly httpGistPattern = /gist\.github\.com\/([^/]+)\/([a-f0-9]+)/;

  canHandle(reference: string): boolean {
    return this.gistUrlPattern.test(reference) || 
           this.httpGistPattern.test(reference);
  }

  async fetch(reference: string, options?: StorageOptions): Promise<MlldModuleSource> {
    const parsed = this.parseReference(reference);
    const { username, gistId } = parsed.parts;

    // Fetch gist metadata from GitHub API
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: this.buildHeaders(options?.token),
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
    });

    if (!response.ok) {
      throw new MlldImportError(
        `Failed to fetch gist: ${response.statusText}`,
        { reference, status: response.status }
      );
    }

    const gistData = await response.json();

    // Validate response structure
    if (!isGistResponse(gistData)) {
      throw new MlldImportError(
        'Invalid gist response from GitHub API',
        { reference }
      );
    }

    // Find .mld or .mlld file
    const mldFile = Object.values(gistData.files).find((f) =>
      f.filename.endsWith('.mld') || f.filename.endsWith('.mlld')
    );

    if (!mldFile) {
      throw new MlldImportError(
        'No .mld or .mlld file found in gist',
        { reference, availableFiles: Object.keys(gistData.files) }
      );
    }

    // Get the current revision
    const revision = gistData.history[0].version;
    const immutableUrl = `https://gist.githubusercontent.com/${username}/${gistId}/raw/${revision}/${mldFile.filename}`;

    // Fetch the actual content
    const contentResponse = await fetch(immutableUrl, {
      headers: this.buildHeaders(options?.token),
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
    });

    if (!contentResponse.ok) {
      throw new MlldImportError(
        `Failed to fetch gist content: ${contentResponse.statusText}`,
        { reference, status: contentResponse.status }
      );
    }

    const content = await contentResponse.text();

    return {
      content,
      metadata: {
        provider: 'github-gist',
        author: username,
        revision,
        sourceUrl: gistData.html_url,
        immutableUrl,
        timestamp: new Date(gistData.history[0].committed_at),
        extra: {
          gistId,
          filename: mldFile.filename,
          description: gistData.description
        }
      }
    };
  }

  validateResponse(data: unknown): boolean {
    return isGistResponse(data);
  }

  getCacheKey(reference: string): string {
    const parsed = this.parseReference(reference);
    return `gist:${parsed.parts.username}:${parsed.parts.gistId}`;
  }

  private parseReference(reference: string): ParsedReference {
    // Try mlld:// format first
    let match = reference.match(this.gistUrlPattern);
    if (match) {
      return {
        provider: 'github-gist',
        parts: {
          username: match[1],
          gistId: match[2]
        },
        raw: reference
      };
    }

    // Try HTTP URL format
    match = reference.match(this.httpGistPattern);
    if (match) {
      return {
        provider: 'github-gist',
        parts: {
          username: match[1],
          gistId: match[2]
        },
        raw: reference
      };
    }

    throw new MlldImportError(
      'Invalid gist reference format',
      { reference }
    );
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