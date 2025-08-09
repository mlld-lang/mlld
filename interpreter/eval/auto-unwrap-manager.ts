/**
 * Centralized manager for auto-unwrapping LoadContentResult objects
 * and preserving their metadata through JavaScript/Node execution.
 * 
 * This implements a thread-local pattern using AsyncLocalStorage to handle
 * nested and concurrent executions safely.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { isLoadContentResult, isLoadContentResultArray, LoadContentResult } from '@core/types/load-content';

/**
 * Thread-local storage for metadata shelves
 * Each async context gets its own shelf instance
 */
const asyncLocalStorage = new AsyncLocalStorage<MetadataShelf>();

/**
 * Metadata shelf for preserving LoadContentResult metadata
 */
class MetadataShelf {
  private shelf: Map<string, LoadContentResult> = new Map();
  private singleFileMetadata: LoadContentResult | null = null;
  
  /**
   * Store LoadContentResult objects on the shelf before unwrapping
   */
  storeMetadata(value: any): void {
    if (isLoadContentResultArray(value)) {
      // Store each LoadContentResult keyed by its content
      for (const item of value) {
        if (isLoadContentResult(item)) {
          this.shelf.set(item.content, item);
        }
      }
    } else if (isLoadContentResult(value)) {
      // Store both in shelf (for exact matching) and as single file metadata (for auto-restoration)
      this.shelf.set(value.content, value);
      this.singleFileMetadata = value;
    }
  }
  
  /**
   * Attempt to restore metadata to returned values from JS functions
   */
  restoreMetadata(value: any): any {
    // Handle arrays (existing functionality)
    if (Array.isArray(value)) {
      // Check if all items are strings that match shelved content
      const restored: any[] = [];
      let hasRestorable = false;
      
      for (const item of value) {
        if (typeof item === 'string' && this.shelf.has(item)) {
          // Found matching content - restore the LoadContentResult
          restored.push(this.shelf.get(item));
          hasRestorable = true;
        } else {
          // Not restorable - keep as is
          restored.push(item);
        }
      }
      
      // Only return restored array if we actually restored something
      return hasRestorable ? restored : value;
    }
    
    // Handle single values (new functionality)
    if (typeof value === 'string' && this.singleFileMetadata) {
      // Check for exact match first
      if (this.shelf.has(value)) {
        return this.shelf.get(value);
      }
      
      // Auto-restore for transformed single file content
      // Create a new LoadContentResult with the transformed content but original metadata
      const original = this.singleFileMetadata;
      const restored = {
        ...original,
        content: value  // Use the transformed content
      };
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[MetadataShelf] Auto-restoring single file metadata:', {
          originalContent: original.content.substring(0, 50) + '...',
          newContent: value.substring(0, 50) + '...',
          filename: original.filename
        });
      }
      
      return restored;
    }
    
    return value;
  }
  
  /**
   * Clear the shelf to prevent memory leaks
   */
  clear(): void {
    this.shelf.clear();
    this.singleFileMetadata = null;
  }
}

/**
 * Central manager for auto-unwrapping with metadata preservation
 */
export class AutoUnwrapManager {
  /**
   * Auto-unwrap LoadContentResult objects to their content property
   * while preserving metadata on the thread-local shelf
   * 
   * @param value - The value to potentially unwrap
   * @returns The unwrapped content or the original value
   */
  static unwrap(value: any): any {
    // Get or create shelf for current async context
    const shelf = asyncLocalStorage.getStore() || new MetadataShelf();
    
    if (process.env.MLLD_DEBUG === 'true' && (isLoadContentResult(value) || isLoadContentResultArray(value))) {
      console.error('[AutoUnwrapManager.unwrap] Unwrapping:', {
        type: isLoadContentResultArray(value) ? 'LoadContentResultArray' : 'LoadContentResult',
        shelfInContext: !!asyncLocalStorage.getStore()
      });
    }
    
    // Store metadata before unwrapping
    shelf.storeMetadata(value);
    
    // Handle single LoadContentResult
    if (isLoadContentResult(value)) {
      return value.content;
    }
    
    // Handle LoadContentResultArray - unwrap to array of content strings
    if (isLoadContentResultArray(value)) {
      return value.map(item => item.content);
    }
    
    // Return original value if not a LoadContentResult
    return value;
  }
  
  /**
   * Execute a function with metadata preservation
   * Sets up a new async context with its own metadata shelf
   * 
   * @param fn - The function to execute
   * @returns The result with restored metadata if applicable
   */
  static async executeWithPreservation<T>(fn: () => T | Promise<T>): Promise<T> {
    const shelf = new MetadataShelf();
    
    try {
      // Run the function in a new async context with its own shelf
      const result = await asyncLocalStorage.run(shelf, fn);
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[AutoUnwrapManager] Result before restoration:', result);
        console.error('[AutoUnwrapManager] Shelf contents:', shelf.shelf);
      }
      
      // Restore metadata if applicable
      const restored = shelf.restoreMetadata(result) as T;
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[AutoUnwrapManager] Result after restoration:', restored);
      }
      
      return restored;
    } finally {
      // Always clear the shelf to prevent memory leaks
      shelf.clear();
    }
  }
  
  /**
   * Restore metadata from the current context's shelf
   * Used when we have a result that might contain unwrapped content
   * 
   * @param value - The value to potentially restore
   * @returns The value with restored metadata if applicable
   */
  static restore(value: any): any {
    const shelf = asyncLocalStorage.getStore();
    if (!shelf) {
      return value;
    }
    
    return shelf.restoreMetadata(value);
  }
  
  /**
   * Clear the current context's shelf
   * Should be called after restoration to prevent memory leaks
   */
  static clear(): void {
    const shelf = asyncLocalStorage.getStore();
    if (shelf) {
      shelf.clear();
    }
  }
}