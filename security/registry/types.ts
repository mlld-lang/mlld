/**
 * Vendor-agnostic types for module storage
 * These interfaces abstract away provider-specific details
 */

/**
 * Represents a module source regardless of storage provider
 */
export interface MlldModuleSource {
  /**
   * The actual content of the module
   */
  content: string;
  
  /**
   * Metadata about the module source
   */
  metadata: ModuleMetadata;
}

/**
 * Common metadata across all storage providers
 */
export interface ModuleMetadata {
  /**
   * Storage provider type
   */
  provider: 'github-gist' | 'github-repo' | 'gitlab' | 'bitbucket' | 'generic-url';
  
  /**
   * Author/owner of the module
   */
  author: string;
  
  /**
   * Unique revision/version identifier
   */
  revision: string;
  
  /**
   * Full URL to the module source
   */
  sourceUrl: string;
  
  /**
   * Immutable URL for this specific version (if available)
   */
  immutableUrl?: string;
  
  /**
   * When this version was created/committed
   */
  timestamp?: Date;
  
  /**
   * File path within the repository (for repo-based storage)
   */
  path?: string;
  
  /**
   * Additional provider-specific metadata
   */
  extra?: Record<string, unknown>;
}

/**
 * Interface for storage adapters
 */
export interface StorageAdapter {
  /**
   * Check if this adapter can handle the given URL/reference
   */
  canHandle(reference: string): boolean;
  
  /**
   * Fetch module content from the storage provider
   */
  fetch(reference: string, options?: StorageOptions): Promise<MlldModuleSource>;
  
  /**
   * Validate that the fetched data matches expected structure
   */
  validateResponse(data: unknown): boolean;
  
  /**
   * Extract module identifier from reference (for caching)
   */
  getCacheKey(reference: string): string;
}

/**
 * Common options for storage operations
 */
export interface StorageOptions {
  /**
   * Authentication token (if required)
   */
  token?: string;
  
  /**
   * Specific branch/tag/revision to fetch
   */
  revision?: string;
  
  /**
   * Timeout for the fetch operation
   */
  timeout?: number;
  
  /**
   * Whether to validate checksums/hashes
   */
  validateIntegrity?: boolean;
}

/**
 * Result of parsing a module reference
 */
export interface ParsedReference {
  /**
   * The storage provider to use
   */
  provider: string;
  
  /**
   * Provider-specific identifier parts
   */
  parts: Record<string, string>;
  
  /**
   * Original reference string
   */
  raw: string;
}

/**
 * Type guard for module metadata
 */
export function isModuleMetadata(obj: unknown): obj is ModuleMetadata {
  return typeof obj === 'object' &&
    obj !== null &&
    'provider' in obj &&
    'author' in obj &&
    'revision' in obj &&
    'sourceUrl' in obj &&
    typeof (obj as ModuleMetadata).author === 'string' &&
    typeof (obj as ModuleMetadata).revision === 'string' &&
    typeof (obj as ModuleMetadata).sourceUrl === 'string';
}

/**
 * Type guard for module source
 */
export function isMlldModuleSource(obj: unknown): obj is MlldModuleSource {
  return typeof obj === 'object' &&
    obj !== null &&
    'content' in obj &&
    'metadata' in obj &&
    typeof (obj as MlldModuleSource).content === 'string' &&
    isModuleMetadata((obj as MlldModuleSource).metadata);
}