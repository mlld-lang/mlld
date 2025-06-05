/**
 * Transform GitHub Gist URLs to their raw content URLs
 */
export class GistTransformer {
  /**
   * Check if a URL is a GitHub Gist URL
   */
  static isGistUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'gist.github.com';
    } catch {
      return false;
    }
  }

  /**
   * Transform a Gist URL to its raw content URL
   * 
   * Examples:
   * - https://gist.github.com/user/id -> https://gist.githubusercontent.com/user/id/raw/
   * - https://gist.github.com/user/id#file-name-ext -> https://gist.githubusercontent.com/user/id/raw/name.ext
   */
  static async transformToRaw(url: string): Promise<string> {
    if (!this.isGistUrl(url)) {
      return url;
    }

    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/').filter(p => p);
      
      if (pathParts.length < 2) {
        throw new Error('Invalid Gist URL format');
      }

      const [user, gistId] = pathParts;
      
      // Check if there's a file hash (e.g., #file-example-md)
      let fileName = '';
      if (parsed.hash) {
        // Convert #file-name-ext to name.ext
        const fileMatch = parsed.hash.match(/^#file-(.+)$/);
        if (fileMatch) {
          fileName = fileMatch[1].replace(/-([^-]+)$/, '.$1');
        }
      }

      // For now, we'll use the latest version (no commit SHA)
      // In the future, we could fetch the gist metadata to get a specific version
      const rawUrl = fileName
        ? `https://gist.githubusercontent.com/${user}/${gistId}/raw/${fileName}`
        : `https://gist.githubusercontent.com/${user}/${gistId}/raw/`;

      return rawUrl;
    } catch (error) {
      throw new Error(`Failed to transform Gist URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract Gist metadata from URL
   */
  static parseGistUrl(url: string): { user: string; id: string; file?: string } | null {
    if (!this.isGistUrl(url)) {
      return null;
    }

    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/').filter(p => p);
      
      if (pathParts.length < 2) {
        return null;
      }

      const [user, id] = pathParts;
      
      // Extract file name from hash
      let file: string | undefined;
      if (parsed.hash) {
        const fileMatch = parsed.hash.match(/^#file-(.+)$/);
        if (fileMatch) {
          file = fileMatch[1].replace(/-([^-]+)$/, '.$1');
        }
      }

      return { user, id, file };
    } catch {
      return null;
    }
  }
}