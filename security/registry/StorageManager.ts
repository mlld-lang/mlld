import { StorageAdapter, MlldModuleSource, StorageOptions } from './types';
import { GistAdapter } from './adapters/GistAdapter';
import { RepositoryAdapter } from './adapters/RepositoryAdapter';
import { MlldImportError } from '@core/errors';

/**
 * Manages storage adapters and provides a unified interface for module fetching
 * This abstraction allows us to easily add new storage providers in the future
 */
export class StorageManager {
  private adapters: StorageAdapter[] = [];

  constructor() {
    // Register default adapters
    this.registerAdapter(new GistAdapter());
    this.registerAdapter(new RepositoryAdapter());
  }

  /**
   * Register a new storage adapter
   */
  registerAdapter(adapter: StorageAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Check if any adapter can handle the given reference
   */
  canResolve(reference: string): boolean {
    return this.adapters.some(adapter => adapter.canHandle(reference));
  }

  /**
   * Fetch module content using the appropriate adapter
   */
  async fetch(reference: string, options?: StorageOptions): Promise<MlldModuleSource> {
    // Find the first adapter that can handle this reference
    const adapter = this.adapters.find(a => a.canHandle(reference));
    
    if (!adapter) {
      throw new MlldImportError(
        `No storage adapter found for reference: ${reference}`,
        { 
          reference,
          supportedFormats: [
            'mlld://gist/username/gistId',
            'mlld://github/owner/repo/path/to/file.mld',
            'https://gist.github.com/username/gistId',
            'https://github.com/owner/repo/blob/branch/path/to/file.mld'
          ]
        }
      );
    }

    try {
      return await adapter.fetch(reference, options);
    } catch (error) {
      // Enhance error with adapter information
      if (error instanceof MlldImportError) {
        throw error;
      }
      
      throw new MlldImportError(
        `Failed to fetch module from storage`,
        { 
          reference,
          adapter: adapter.constructor.name,
          originalError: error
        }
      );
    }
  }

  /**
   * Get cache key for a reference
   */
  getCacheKey(reference: string): string {
    const adapter = this.adapters.find(a => a.canHandle(reference));
    if (!adapter) {
      // Fallback to using the reference itself
      return `unknown:${reference}`;
    }
    
    return adapter.getCacheKey(reference);
  }

  /**
   * Parse a reference to determine its type and components
   */
  parseReference(reference: string): {
    type: 'gist' | 'repository' | 'url' | 'unknown';
    provider?: string;
    components?: Record<string, string>;
  } {
    // Check each adapter
    for (const adapter of this.adapters) {
      if (adapter.canHandle(reference)) {
        if (adapter instanceof GistAdapter) {
          return { type: 'gist', provider: 'github' };
        } else if (adapter instanceof RepositoryAdapter) {
          return { type: 'repository', provider: 'github' };
        }
      }
    }

    // Check if it's a generic URL
    if (reference.startsWith('http://') || reference.startsWith('https://')) {
      return { type: 'url' };
    }

    return { type: 'unknown' };
  }

  /**
   * Get all registered adapter names
   */
  getAdapterNames(): string[] {
    return this.adapters.map(a => a.constructor.name);
  }
}

/**
 * Singleton instance for convenience
 */
export const defaultStorageManager = new StorageManager();