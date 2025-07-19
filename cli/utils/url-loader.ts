import { URL } from 'url';
import https from 'https';
import http from 'http';

export interface URLLoadResult {
  content: string;
  finalUrl: string; // After redirects
}

export class URLLoader {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB
  private static readonly MAX_REDIRECTS = 5;

  static isURL(input: string): boolean {
    try {
      const url = new URL(input);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  static async load(urlString: string, options?: {
    timeout?: number;
    maxSize?: number;
  }): Promise<URLLoadResult> {
    const timeout = options?.timeout || this.DEFAULT_TIMEOUT;
    const maxSize = options?.maxSize || this.DEFAULT_MAX_SIZE;

    return this.fetchWithRedirects(urlString, {
      timeout,
      maxSize,
      redirectCount: 0
    });
  }

  private static async fetchWithRedirects(
    urlString: string, 
    options: {
      timeout: number;
      maxSize: number;
      redirectCount: number;
    }
  ): Promise<URLLoadResult> {
    if (options.redirectCount > this.MAX_REDIRECTS) {
      throw new Error(`Too many redirects (max ${this.MAX_REDIRECTS})`);
    }

    const url = new URL(urlString);
    const protocol = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const request = protocol.get(urlString, {
        timeout: options.timeout,
        headers: {
          'User-Agent': 'mlld-cli',
          'Accept': 'text/plain, text/markdown, text/x-markdown, */*'
        }
      }, (response) => {
        // Handle redirects
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, urlString).toString();
          resolve(this.fetchWithRedirects(redirectUrl, {
            ...options,
            redirectCount: options.redirectCount + 1
          }));
          return;
        }

        // Check status code
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        // Check content length if provided
        const contentLength = response.headers['content-length'];
        if (contentLength && parseInt(contentLength) > options.maxSize) {
          reject(new Error(`Content too large: ${contentLength} bytes (max ${options.maxSize})`));
          request.destroy();
          return;
        }

        // Collect data
        const chunks: Buffer[] = [];
        let totalSize = 0;

        response.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > options.maxSize) {
            reject(new Error(`Content too large: exceeded ${options.maxSize} bytes`));
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });

        response.on('end', () => {
          const content = Buffer.concat(chunks).toString('utf8');
          resolve({
            content,
            finalUrl: urlString
          });
        });

        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error(`Request timeout after ${options.timeout}ms`));
      });
    });
  }
}