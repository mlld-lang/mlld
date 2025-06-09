import type { CacheConfig } from '../utils/EnvironmentFactory';

export interface TTLConfig {
  type: 'live' | 'static' | 'duration';
  value?: number; // milliseconds for duration type
}

export interface CacheEntry {
  content: string;
  timestamp: number;
  ttl?: TTLConfig;
  metadata?: any;
}

export interface CacheOperation {
  operation: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  content?: string;
  ttl?: TTLConfig;
  hit?: boolean;
  timestamp: number;
}

/**
 * Mock URL Cache for testing with TTL enforcement and operation tracking
 */
export class MockURLCache {
  private config: CacheConfig;
  private cache = new Map<string, CacheEntry>();
  private operations: CacheOperation[] = [];
  
  // Statistics for verification
  private hitCount = 0;
  private missCount = 0;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Get content from cache with TTL enforcement
   */
  async get(url: string, ttl?: TTLConfig): Promise<string | null> {
    const operation: CacheOperation = {
      operation: 'get',
      key: url,
      ttl,
      timestamp: Date.now()
    };

    const entry = this.cache.get(url);
    
    if (!entry) {
      this.missCount++;
      operation.hit = false;
      this.operations.push(operation);
      return null;
    }

    // Check TTL enforcement based on config strictness
    if (this.config.ttlBehavior === 'strict' && ttl) {
      const isExpired = this.checkTTLExpired(entry, ttl);
      if (isExpired) {
        this.cache.delete(url); // Remove expired entry
        this.missCount++;
        operation.hit = false;
        this.operations.push(operation);
        return null;
      }
    }

    this.hitCount++;
    operation.hit = true;
    operation.content = entry.content;
    this.operations.push(operation);
    
    return entry.content;
  }

  /**
   * Set content in cache with TTL metadata
   */
  async set(url: string, content: string, options?: { ttl?: TTLConfig; metadata?: any }): Promise<void> {
    const entry: CacheEntry = {
      content,
      timestamp: Date.now(),
      ttl: options?.ttl,
      metadata: options?.metadata
    };

    this.cache.set(url, entry);
    
    this.operations.push({
      operation: 'set',
      key: url,
      content,
      ttl: options?.ttl,
      timestamp: Date.now()
    });
  }

  /**
   * Delete entry from cache
   */
  async delete(url: string): Promise<void> {
    this.cache.delete(url);
    
    this.operations.push({
      operation: 'delete',
      key: url,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    
    this.operations.push({
      operation: 'clear',
      key: '*',
      timestamp: Date.now()
    });
  }

  /**
   * Fetch URL with caching (mock implementation)
   */
  async fetchURL(url: string, securityOptions?: any, configuredBy?: string): Promise<string> {
    // Check cache first
    const cached = await this.get(url, securityOptions?.ttl);
    if (cached) {
      return cached;
    }

    // Mock fetch implementation
    const content = this.mockFetch(url);
    
    // Cache the result
    await this.set(url, content, { 
      ttl: securityOptions?.ttl,
      metadata: { configuredBy }
    });
    
    return content;
  }

  // === Mock Configuration Methods ===

  /**
   * Pre-populate cache with mock responses
   */
  mockResponse(url: string, content: string, ttl?: TTLConfig): void {
    const entry: CacheEntry = {
      content,
      timestamp: Date.now(),
      ttl
    };
    
    this.cache.set(url, entry);
  }

  /**
   * Mock cache miss for specific URL
   */
  mockCacheMiss(url: string): void {
    this.cache.delete(url);
  }

  /**
   * Mock cache expiry for specific URL
   */
  mockCacheExpiry(url: string): void {
    const entry = this.cache.get(url);
    if (entry) {
      // Set timestamp to past to simulate expiry
      entry.timestamp = Date.now() - 1000000;
      this.cache.set(url, entry);
    }
  }

  /**
   * Set TTL behavior for testing
   */
  setTTLBehavior(behavior: 'strict' | 'lenient'): void {
    this.config.ttlBehavior = behavior;
  }

  // === Verification Methods ===

  /**
   * Get verification data for test assertions
   */
  getVerificationData(): {
    cacheHits: number;
    cacheMisses: number;
    cacheOperations: CacheOperation[];
  } {
    return {
      cacheHits: this.hitCount,
      cacheMisses: this.missCount,
      cacheOperations: [...this.operations]
    };
  }

  /**
   * Check if URL was cached
   */
  wasCached(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Check if URL was accessed
   */
  wasAccessed(url: string): boolean {
    return this.operations.some(op => op.key === url && op.operation === 'get');
  }

  /**
   * Get number of cache operations
   */
  getOperationCount(operation?: 'get' | 'set' | 'delete' | 'clear'): number {
    if (operation) {
      return this.operations.filter(op => op.operation === operation).length;
    }
    return this.operations.length;
  }

  /**
   * Get cache hit ratio
   */
  getHitRatio(): number {
    const total = this.hitCount + this.missCount;
    return total > 0 ? this.hitCount / total : 0;
  }

  /**
   * Get cache size
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Get all cached URLs
   */
  getCachedURLs(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Verify TTL enforcement is working correctly
   */
  verifyTTLEnforcement(url: string, expectedBehavior: 'cached' | 'expired' | 'live'): boolean {
    const entry = this.cache.get(url);
    
    switch (expectedBehavior) {
      case 'cached':
        return !!entry;
      case 'expired':
        return !entry || this.checkTTLExpired(entry, entry.ttl);
      case 'live':
        // Live content should not be cached
        return !this.wasCached(url) || this.getOperationCount('get') > this.getOperationCount('set');
      default:
        return false;
    }
  }

  /**
   * Reset all tracking data for test isolation
   */
  reset(): void {
    this.cache.clear();
    this.operations = [];
    this.hitCount = 0;
    this.missCount = 0;
  }

  // === Private Helper Methods ===

  private checkTTLExpired(entry: CacheEntry, ttl?: TTLConfig): boolean {
    if (!ttl) return false;
    
    switch (ttl.type) {
      case 'live':
        return true; // Always consider live content as expired for fresh fetch
      case 'static':
        return false; // Static content never expires
      case 'duration':
        if (ttl.value) {
          const age = Date.now() - entry.timestamp;
          return age > ttl.value;
        }
        return false;
      default:
        return false;
    }
  }

  private mockFetch(url: string): string {
    // Mock responses for testing
    const mockResponses: Record<string, string> = {
      'https://example.com/test.mld': '@text greeting = "Hello from URL"',
      'https://cache-test.com/data': 'cached content',
      'https://live-test.com/data': `live content ${Date.now()}`,
      'https://static-test.com/data': 'static content that never changes',
      'https://blocked.com/malicious': 'malicious content',
      'https://raw.githubusercontent.com/example/test.mld': '@text example = "GitHub content"'
    };

    // Check for mock response
    if (mockResponses[url]) {
      return mockResponses[url];
    }

    // Dynamic response for URLs with timestamps
    if (url.includes('timestamp')) {
      return `Dynamic content fetched at ${Date.now()}`;
    }

    // Default mock response
    return `Mock content for ${url}`;
  }
}