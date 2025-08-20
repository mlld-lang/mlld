import { isLoadContentResult, isLoadContentResultArray, LoadContentResult } from '@core/types/load-content';

/**
 * Preserves LoadContentResult metadata through JavaScript transformations
 * WHY: Alligator syntax creates rich objects with content + metadata (.filename, .fm)
 *      JavaScript functions work with simple strings for simplicity
 *      Metadata must survive transformations for downstream access
 */
export class MetadataShelf {
  private shelf: Map<string, LoadContentResult> = new Map();
  
  /**
   * Store metadata from LoadContentResult values
   * Called before auto-unwrapping for JS execution
   */
  storeMetadata(value: any): void {
    if (isLoadContentResultArray(value)) {
      for (const item of value) {
        if (isLoadContentResult(item)) {
          // Use content as key to enable lookup after transformation
          this.shelf.set(item.content, item);
        }
      }
    } else if (isLoadContentResult(value)) {
      this.shelf.set(value.content, value);
    }
  }
  
  /**
   * Restore metadata to transformed values
   * Called after JS execution to reattach metadata
   */
  restoreMetadata(value: any): any {
    if (!Array.isArray(value)) return value;
    
    const restored: any[] = [];
    let hasRestorable = false;
    
    for (const item of value) {
      if (typeof item === 'string' && this.shelf.has(item)) {
        // Restore the full LoadContentResult with metadata
        restored.push(this.shelf.get(item));
        hasRestorable = true;
      } else {
        restored.push(item);
      }
    }
    
    return hasRestorable ? restored : value;
  }
  
  /**
   * Clear the shelf
   * Should be called after each exec invocation completes
   */
  clear(): void {
    this.shelf.clear();
  }
  
  /**
   * Check if a value has stored metadata
   */
  hasMetadata(value: string): boolean {
    return typeof value === 'string' && this.shelf.has(value);
  }
  
  /**
   * Get stored metadata for a value
   */
  getMetadata(value: string): LoadContentResult | undefined {
    return this.shelf.get(value);
  }
}

/**
 * Module-level metadata shelf instance
 * Stores LoadContentResult metadata during auto-unwrapping
 * Thread-safe via AsyncLocalStorage when needed
 */
export const globalMetadataShelf = new MetadataShelf();