import type { ResolvedURLConfig } from '@core/config/types';
import type { Variable } from '@core/types/variable';
import { URLCache } from '../cache/URLCache';
import { ImmutableCache } from '@core/security/ImmutableCache';

/**
 * CacheManager handles all caching operations for the Environment.
 * This includes URL caching, resolver variable caching, and cache TTL management.
 */
export class CacheManager {
  private urlCache = new Map<string, { content: string; timestamp: number; ttl?: number }>();
  private resolverVariableCache = new Map<string, Variable>();
  
  constructor(
    private urlCacheManager?: URLCache,
    private immutableCache?: ImmutableCache,
    private urlConfig?: ResolvedURLConfig
  ) {}

  /**
   * Get URL cache TTL based on configuration rules
   */
  getURLCacheTTL(url: string): number {
    if (!this.urlConfig?.cache.rules) {
      return this.urlConfig?.cache.defaultTTL || 5 * 60 * 1000;
    }
    
    // Find matching rule
    for (const rule of this.urlConfig.cache.rules) {
      if (rule.pattern.test(url)) {
        return rule.ttl;
      }
    }
    
    // Fall back to default
    return this.urlConfig.cache.defaultTTL;
  }

  /**
   * Get URLCache manager instance
   */
  getURLCacheManager(): URLCache | undefined {
    return this.urlCacheManager;
  }

  /**
   * Get ImmutableCache instance
   */
  getImmutableCache(): ImmutableCache | undefined {
    return this.immutableCache;
  }

  /**
   * Get resolver variable from cache
   */
  getResolverVariable(key: string): Variable | undefined {
    return this.resolverVariableCache.get(key);
  }

  /**
   * Set resolver variable in cache
   */
  setResolverVariable(key: string, variable: Variable): void {
    this.resolverVariableCache.set(key, variable);
  }

  /**
   * Clear resolver variable cache
   */
  clearResolverVariableCache(): void {
    this.resolverVariableCache.clear();
  }

  /**
   * Get URL cache entry
   */
  getURLCacheEntry(url: string): { content: string; timestamp: number; ttl?: number } | undefined {
    return this.urlCache.get(url);
  }

  /**
   * Set URL cache entry
   */
  setURLCacheEntry(url: string, content: string, ttl?: number): void {
    this.urlCache.set(url, {
      content,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Check if URL cache entry is valid (not expired)
   */
  isURLCacheEntryValid(url: string): boolean {
    const cached = this.urlCache.get(url);
    if (!cached) return false;
    
    const now = Date.now();
    const ttl = cached.ttl || this.getURLCacheTTL(url);
    return (now - cached.timestamp) < ttl;
  }

  /**
   * Update URL configuration for cache TTL calculations
   */
  setURLConfig(config: ResolvedURLConfig): void {
    this.urlConfig = config;
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.urlCache.clear();
    this.resolverVariableCache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      urlCacheSize: this.urlCache.size,
      resolverVariableCacheSize: this.resolverVariableCache.size,
      urlCacheEntries: Array.from(this.urlCache.keys()),
      resolverVariables: Array.from(this.resolverVariableCache.keys())
    };
  }
}