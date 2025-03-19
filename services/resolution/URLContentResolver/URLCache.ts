import { IURLCache } from './IURLCache.js';
import { URLResponse } from './IURLContentResolver.js';

/**
 * Simple in-memory implementation of IURLCache
 */
export class URLCache implements IURLCache {
  private cache: Map<string, URLResponse> = new Map();
  private maxSize: number;
  
  /**
   * Create a new URLCache
   * @param maxSize Maximum number of entries to store in the cache (default: 100)
   */
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }
  
  /**
   * Get a cached response
   * @param url The URL to retrieve
   * @returns The cached response or null if not found
   */
  get(url: string): URLResponse | null {
    return this.cache.get(url) || null;
  }
  
  /**
   * Store a response in the cache
   * @param url The URL to cache
   * @param response The response to cache
   */
  set(url: string, response: URLResponse): void {
    // Simple LRU eviction if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(url)) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(url, response);
  }
  
  /**
   * Clear the cache
   * @param url Optional specific URL to clear
   */
  clear(url?: string): void {
    if (url) {
      this.cache.delete(url);
    } else {
      this.cache.clear();
    }
  }
  
  /**
   * Check if the URL exists in cache
   * @param url The URL to check
   * @returns True if the URL is cached
   */
  has(url: string): boolean {
    return this.cache.has(url);
  }
  
  /**
   * Get the size of the cache
   * @returns The number of cached URLs
   */
  size(): number {
    return this.cache.size;
  }
}