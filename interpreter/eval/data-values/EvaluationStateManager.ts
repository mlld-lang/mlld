import type { Environment } from '../../env/Environment';

/**
 * Represents the state of an evaluation operation
 */
export interface EvaluationState {
  evaluated: boolean;
  result?: any;
  error?: Error;
  depth?: number;
  maxDepth?: number;
}

/**
 * Result of a cache lookup operation
 */
export interface CacheResult {
  hit: boolean;
  result?: any;
  error?: Error;
}

/**
 * Manages evaluation state and caching for data value evaluations.
 * 
 * This class provides:
 * - Evaluation result caching with object reference keys
 * - Error state preservation (caching both success and failure states)
 * - Cache management and performance monitoring
 */
export class EvaluationStateManager {
  private evaluationCache = new Map<any, EvaluationState>();

  /**
   * Attempts to retrieve a cached evaluation result
   * @param value The data value to check cache for
   * @returns Cache result with hit status and cached data/error
   */
  getCachedResult(value: any): CacheResult | null {
    const cached = this.evaluationCache.get(value);
    
    if (!cached) {
      return null;
    }

    // Only return cache hit if evaluation completed and no error occurred
    if (cached.evaluated && !cached.error) {
      return {
        hit: true,
        result: cached.result
      };
    }

    // Return cached error if evaluation failed
    if (cached.evaluated && cached.error) {
      return {
        hit: true,
        error: cached.error
      };
    }

    return null;
  }

  /**
   * Stores an evaluation result in the cache
   * @param value The data value to cache results for
   * @param result The evaluation result (if successful)
   * @param error The error that occurred (if failed)
   */
  setCachedResult(value: any, result?: any, error?: Error): void {
    const state: EvaluationState = {
      evaluated: true,
      result,
      error
    };
    
    this.evaluationCache.set(value, state);
  }

  /**
   * Clears all cached evaluation results
   */
  clearCache(): void {
    this.evaluationCache.clear();
  }

  /**
   * Gets cache performance statistics
   * @returns Object with cache size and other metrics
   */
  getCacheStats(): { size: number; entries: number } {
    return {
      size: this.evaluationCache.size,
      entries: this.evaluationCache.size
    };
  }

  /**
   * Removes a specific cache entry
   * @param value The data value to remove from cache
   */
  removeCacheEntry(value: any): boolean {
    return this.evaluationCache.delete(value);
  }

  /**
   * Checks if a value has been cached
   * @param value The data value to check
   * @returns True if value is in cache
   */
  isCached(value: any): boolean {
    return this.evaluationCache.has(value);
  }
}