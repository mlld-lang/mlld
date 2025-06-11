import { TTLOption } from '@core/resolvers/types';
import { logger } from '@core/utils/logger';

/**
 * Cache entry with TTL metadata
 */
export interface TTLCacheEntry<T = any> {
  key: string;
  value: T;
  cachedAt: Date;
  ttl: TTLOption;
  metadata?: Record<string, any>;
}

/**
 * Cache key strategy for generating cache keys
 */
export type CacheKeyStrategy = 'static' | 'content' | 'timestamp' | 'custom';

/**
 * Options for TTL cache operations
 */
export interface TTLCacheOptions {
  /**
   * Strategy for generating cache keys
   */
  keyStrategy?: CacheKeyStrategy;
  
  /**
   * Custom key generator function
   */
  keyGenerator?: (input: string, metadata?: Record<string, any>) => string;
  
  /**
   * Default TTL if not specified
   */
  defaultTTL?: TTLOption;
  
  /**
   * Maximum number of entries to cache
   */
  maxEntries?: number;
  
  /**
   * Whether to use memory cache (default) or external storage
   */
  storage?: 'memory' | 'external';
  
  /**
   * External storage adapter (if storage is 'external')
   */
  storageAdapter?: TTLStorageAdapter;
}

/**
 * Storage adapter interface for external storage
 */
export interface TTLStorageAdapter {
  get(key: string): Promise<TTLCacheEntry | null>;
  set(key: string, entry: TTLCacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

/**
 * Generic TTL caching service
 */
export class TTLCacheService<T = string> {
  private cache: Map<string, TTLCacheEntry<T>> = new Map();
  private options: TTLCacheOptions;
  private storageAdapter?: TTLStorageAdapter;

  constructor(options: TTLCacheOptions = {}) {
    this.options = {
      keyStrategy: 'static',
      defaultTTL: { duration: 86400 }, // 24 hours default
      maxEntries: 1000,
      storage: 'memory',
      ...options
    };
    
    this.storageAdapter = options.storageAdapter;
    
    // Start cleanup interval for expired entries
    this.startCleanupInterval();
  }

  /**
   * Get cached value by key
   */
  async get(input: string, metadata?: Record<string, any>): Promise<T | null> {
    const key = this.generateKey(input, metadata);
    
    let entry: TTLCacheEntry<T> | null = null;
    
    if (this.options.storage === 'external' && this.storageAdapter) {
      entry = await this.storageAdapter.get(key);
    } else {
      entry = this.cache.get(key) || null;
    }
    
    if (!entry) {
      return null;
    }
    
    // Check if entry has expired
    if (this.isExpired(entry)) {
      await this.delete(key);
      return null;
    }
    
    logger.debug(`Cache hit for key: ${key}`);
    return entry.value;
  }

  /**
   * Set cached value with TTL
   */
  async set(
    input: string, 
    value: T, 
    ttl?: TTLOption, 
    metadata?: Record<string, any>
  ): Promise<string> {
    const key = this.generateKey(input, metadata);
    const finalTTL = ttl || this.options.defaultTTL!;
    
    const entry: TTLCacheEntry<T> = {
      key,
      value,
      cachedAt: new Date(),
      ttl: finalTTL,
      metadata
    };
    
    if (this.options.storage === 'external' && this.storageAdapter) {
      await this.storageAdapter.set(key, entry);
    } else {
      // Check max entries for memory cache
      if (this.cache.size >= (this.options.maxEntries || 1000)) {
        // Remove oldest entry
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
      
      this.cache.set(key, entry);
    }
    
    logger.debug(`Cached value for key: ${key} with TTL: ${this.formatTTL(finalTTL)}`);
    return key;
  }

  /**
   * Delete cached entry
   */
  async delete(key: string): Promise<void> {
    if (this.options.storage === 'external' && this.storageAdapter) {
      await this.storageAdapter.delete(key);
    } else {
      this.cache.delete(key);
    }
    
    logger.debug(`Deleted cache entry: ${key}`);
  }

  /**
   * Clear all cached entries
   */
  async clear(): Promise<void> {
    if (this.options.storage === 'external' && this.storageAdapter) {
      await this.storageAdapter.clear();
    } else {
      this.cache.clear();
    }
    
    logger.debug('Cleared all cache entries');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    memoryUsage?: number;
  }> {
    let entries: TTLCacheEntry<T>[] = [];
    
    if (this.options.storage === 'external' && this.storageAdapter) {
      const keys = await this.storageAdapter.keys();
      for (const key of keys) {
        const entry = await this.storageAdapter.get(key);
        if (entry) {
          entries.push(entry);
        }
      }
    } else {
      entries = Array.from(this.cache.values());
    }
    
    const expiredCount = entries.filter(entry => this.isExpired(entry)).length;
    
    return {
      totalEntries: entries.length,
      expiredEntries: expiredCount,
      memoryUsage: this.options.storage === 'memory' ? 
        process.memoryUsage().heapUsed : undefined
    };
  }

  /**
   * Generate cache key based on strategy
   */
  private generateKey(input: string, metadata?: Record<string, any>): string {
    if (this.options.keyGenerator) {
      return this.options.keyGenerator(input, metadata);
    }
    
    switch (this.options.keyStrategy) {
      case 'static':
        // Use input as-is
        return input;
        
      case 'content':
        // Hash the input content
        return this.hashString(input);
        
      case 'timestamp':
        // Include timestamp in key
        return `${input}_${Date.now()}`;
        
      case 'custom':
        // Should have custom generator
        throw new Error('Custom key strategy requires keyGenerator function');
        
      default:
        return input;
    }
  }

  /**
   * Check if cache entry has expired
   */
  private isExpired(entry: TTLCacheEntry<T>): boolean {
    const ttl = entry.ttl;
    
    // Special TTL values
    if (ttl.duration === 0) {
      // Live - always expired
      return true;
    }
    
    if (ttl.duration === -1) {
      // Static - never expires
      return false;
    }
    
    // Calculate expiration
    const expirationTime = entry.cachedAt.getTime() + (ttl.duration * 1000);
    return Date.now() > expirationTime;
  }

  /**
   * Format TTL for logging
   */
  private formatTTL(ttl: TTLOption): string {
    if (ttl.duration === 0) return 'live';
    if (ttl.duration === -1) return 'static';
    
    const seconds = ttl.duration;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Start cleanup interval for expired entries
   */
  private startCleanupInterval(): void {
    // Only cleanup for memory storage
    if (this.options.storage !== 'memory') {
      return;
    }
    
    // Run cleanup every 5 minutes
    setInterval(async () => {
      const keysToDelete: string[] = [];
      
      for (const [key, entry] of this.cache.entries()) {
        if (this.isExpired(entry)) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        await this.delete(key);
      }
      
      if (keysToDelete.length > 0) {
        logger.debug(`Cleaned up ${keysToDelete.length} expired cache entries`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Get resolver-specific cache instance
   */
  static forResolver(resolverName: string, options?: TTLCacheOptions): TTLCacheService {
    return new TTLCacheService({
      ...options,
      keyGenerator: (input, metadata) => {
        // Include resolver name in cache key
        const baseKey = options?.keyGenerator ? 
          options.keyGenerator(input, metadata) : 
          input;
        return `${resolverName}:${baseKey}`;
      }
    });
  }
}