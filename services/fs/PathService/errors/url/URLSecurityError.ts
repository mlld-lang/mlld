import { URLError } from './URLError';

/**
 * Error thrown when a URL is blocked for security reasons
 */
export class URLSecurityError extends URLError {
  /**
   * The URL that was blocked
   */
  url: string;
  
  /**
   * The reason for blocking
   */
  reason: string;
  
  constructor(url: string, reason: string) {
    super(`URL access denied: ${url} (${reason})`);
    this.name = 'URLSecurityError';
    this.url = url;
    this.reason = reason;
  }
}