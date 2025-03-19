import { URLResponse } from './IURLContentResolver.js';

/**
 * Cache for URL responses
 */
export interface IURLCache {
  /**
   * Get a cached response
   * @param url The URL to retrieve
   * @returns The cached response or null if not found
   */
  get(url: string): URLResponse | null;
  
  /**
   * Store a response in the cache
   * @param url The URL to cache
   * @param response The response to cache
   */
  set(url: string, response: URLResponse): void;
  
  /**
   * Clear the cache
   * @param url Optional specific URL to clear
   */
  clear(url?: string): void;
  
  /**
   * Check if the URL exists in cache
   * @param url The URL to check
   * @returns True if the URL is cached
   */
  has(url: string): boolean;
  
  /**
   * Get the size of the cache
   * @returns The number of cached URLs
   */
  size(): number;
}