import { URLError } from './URLError.js';

/**
 * Error thrown when URL fetching fails
 */
export class URLFetchError extends URLError {
  /**
   * HTTP status code if available
   */
  statusCode?: number;
  
  /**
   * The URL that failed to fetch
   */
  url: string;
  
  constructor(url: string, message: string, statusCode?: number, cause?: Error) {
    super(`Failed to fetch URL ${url}: ${message}`, cause);
    this.name = 'URLFetchError';
    this.url = url;
    this.statusCode = statusCode;
  }
}