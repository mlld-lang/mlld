import { Service } from '@core/ServiceProvider';
import { injectable } from 'tsyringe';
import { IURLContentResolver, URLFetchOptions, URLResponse, URLValidationOptions } from './IURLContentResolver';
import { URLCache } from './URLCache';
import { URLError, URLFetchError, URLSecurityError, URLValidationError } from './errors/index';

/**
 * Service for validating, fetching, and caching content from URLs
 */
@injectable()
@Service({
  description: 'Service for validating, fetching, and caching content from URLs'
})
export class URLContentResolver implements IURLContentResolver {
  private urlCache: URLCache;
  
  /**
   * Default options for URL validation
   */
  private defaultURLValidationOptions: URLValidationOptions = {
    allowedProtocols: ['http', 'https'],
    allowedDomains: [],
    blockedDomains: [],
    maxResponseSize: 5 * 1024 * 1024, // 5MB
    timeout: 30000 // 30 seconds
  };

  constructor() {
    // Initialize URL cache with default size
    this.urlCache = new URLCache(100);
  }

  /**
   * Checks if a string is a URL
   * 
   * @param path String to check
   * @returns True if the string is a valid URL
   */
  isURL(path: string): boolean {
    if (!path) return false;
    
    try {
      const url = new URL(path);
      // Must have protocol and host to be considered a valid URL
      return !!url.protocol && !!url.host;
    } catch {
      return false;
    }
  }

  /**
   * Validates a URL according to security policy
   * 
   * @param url URL to validate
   * @param options Validation options
   * @returns The validated URL
   * @throws URLValidationError if URL is invalid
   * @throws URLSecurityError if URL is blocked by security policy
   */
  async validateURL(url: string, options?: URLValidationOptions): Promise<string> {
    const opts = { ...this.defaultURLValidationOptions, ...options };
    
    try {
      const parsedUrl = new URL(url);
      
      // Validate protocol
      const protocol = parsedUrl.protocol.replace(':', '');
      if (opts.allowedProtocols?.length && !opts.allowedProtocols.includes(protocol)) {
        throw new URLSecurityError(url, `Protocol '${protocol}' is not allowed`);
      }
      
      // Validate domain
      const domain = parsedUrl.hostname;
      
      // Blocklist takes precedence over allowlist
      if (opts.blockedDomains?.includes(domain)) {
        throw new URLSecurityError(url, `Domain '${domain}' is blocked`);
      }
      
      // If allowlist is not empty, domain must be in the list
      if (opts.allowedDomains?.length && !opts.allowedDomains.includes(domain)) {
        throw new URLSecurityError(url, `Domain '${domain}' is not in the allowlist`);
      }
      
      return url;
    } catch (error) {
      if (error instanceof URLError) {
        throw error;
      }
      
      throw new URLValidationError(url, (error as Error).message);
    }
  }

  /**
   * Fetches content from a URL with caching
   * 
   * @param url URL to fetch
   * @param options Fetch options
   * @returns The URL response with content and metadata
   * @throws URLFetchError if fetch fails
   * @throws URLSecurityError if URL is blocked or response too large
   */
  async fetchURL(url: string, options?: URLFetchOptions): Promise<URLResponse> {
    const opts = {
      bypassCache: false,
      timeout: this.defaultURLValidationOptions.timeout,
      ...options
    };
    
    // Check cache first unless bypass is requested
    if (!opts.bypassCache && this.urlCache.has(url)) {
      const cached = this.urlCache.get(url);
      if (cached) {
        return {
          ...cached,
          fromCache: true
        };
      }
    }
    
    try {
      // Validate URL before fetching
      await this.validateURL(url, {
        timeout: opts.timeout
      });
      
      // Use fetch API to get content
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeout);
      
      const response = await fetch(url, {
        headers: opts.headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new URLFetchError(url, `HTTP error ${response.status}`, response.status);
      }
      
      // Check content size if possible
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.defaultURLValidationOptions.maxResponseSize!) {
        throw new URLSecurityError(url, `Response too large: ${contentLength} bytes`);
      }
      
      // Get content
      const content = await response.text();
      
      // Check actual content size
      if (content.length > this.defaultURLValidationOptions.maxResponseSize!) {
        throw new URLSecurityError(url, `Response too large: ${content.length} bytes`);
      }
      
      // Create response object
      const urlResponse: URLResponse = {
        content,
        metadata: {
          statusCode: response.status,
          contentType: response.headers.get('content-type') || 'text/plain',
          lastModified: response.headers.get('last-modified') || undefined
        },
        fromCache: false,
        url
      };
      
      // Store in cache
      this.urlCache.set(url, urlResponse);
      
      return urlResponse;
    } catch (error) {
      if (error instanceof URLError) {
        throw error;
      }
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new URLFetchError(url, `Request timed out after ${opts.timeout}ms`);
      }
      
      throw new URLFetchError(url, (error as Error).message, undefined, error as Error);
    }
  }
}