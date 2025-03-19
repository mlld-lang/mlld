/**
 * Response from a URL fetch operation
 */
export interface URLResponse {
  /**
   * The content of the URL
   */
  content: string;
  
  /**
   * Response metadata
   */
  metadata: {
    statusCode: number;
    contentType: string;
    lastModified?: string;
    [key: string]: unknown;
  };
  
  /**
   * Whether the response was from cache
   */
  fromCache: boolean;
  
  /**
   * The URL that was fetched
   */
  url: string;
}

/**
 * Options for URL fetching
 */
export interface URLFetchOptions {
  /**
   * Whether to bypass cache
   */
  bypassCache?: boolean;
  
  /**
   * Custom headers to send with the request
   */
  headers?: Record<string, string>;
  
  /**
   * Timeout in milliseconds
   */
  timeout?: number;
}

/**
 * Options for URL validation
 */
export interface URLValidationOptions {
  /**
   * Allowed protocols
   * @default ['http', 'https']
   */
  allowedProtocols?: string[];
  
  /**
   * Domain allowlist (if empty, all domains allowed unless blocklisted)
   */
  allowedDomains?: string[];
  
  /**
   * Domain blocklist (overrides allowlist)
   */
  blockedDomains?: string[];
  
  /**
   * Maximum response size in bytes
   * @default 5MB
   */
  maxResponseSize?: number;
  
  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
}

/**
 * Service for validating, fetching, and caching content from URLs
 */
export interface IURLContentResolver {
  /**
   * Checks if a string is a URL
   * 
   * @param path String to check
   * @returns True if the string is a valid URL
   * 
   * @example
   * ```ts
   * // Check if a path is a URL
   * if (urlResolver.isURL("https://example.com/data.json")) {
   *   console.log("This is a URL");
   * }
   * ```
   */
  isURL(path: string): boolean;

  /**
   * Validates a URL according to security policy
   * 
   * @param url URL to validate
   * @param options Validation options
   * @returns The validated URL
   * @throws URLValidationError if URL is invalid
   * @throws URLSecurityError if URL is blocked by security policy
   * 
   * @example
   * ```ts
   * try {
   *   const validatedUrl = await urlResolver.validateURL("https://example.com/data.json", {
   *     allowedDomains: ["example.com"]
   *   });
   *   console.log(`Valid URL: ${validatedUrl}`);
   * } catch (error) {
   *   console.error(`Invalid URL: ${error.message}`);
   * }
   * ```
   */
  validateURL(url: string, options?: URLValidationOptions): Promise<string>;

  /**
   * Fetches content from a URL with caching
   * 
   * @param url URL to fetch
   * @param options Fetch options
   * @returns The URL response with content and metadata
   * @throws URLFetchError if fetch fails
   * @throws URLSecurityError if URL is blocked or response too large
   * 
   * @example
   * ```ts
   * try {
   *   const response = await urlResolver.fetchURL("https://example.com/data.json");
   *   console.log(`Fetched ${response.url} (${response.fromCache ? 'from cache' : 'from network'})`);
   *   console.log(`Content: ${response.content.substring(0, 100)}...`);
   * } catch (error) {
   *   console.error(`Failed to fetch URL: ${error.message}`);
   * }
   * ```
   */
  fetchURL(url: string, options?: URLFetchOptions): Promise<URLResponse>;
}