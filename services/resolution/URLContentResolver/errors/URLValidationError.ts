import { URLError } from './URLError';

/**
 * Error thrown when a URL is invalid
 */
export class URLValidationError extends URLError {
  /**
   * The invalid URL string
   */
  url: string;
  
  constructor(url: string, message: string) {
    super(`Invalid URL ${url}: ${message}`);
    this.name = 'URLValidationError';
    this.url = url;
  }
}