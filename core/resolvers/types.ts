import { TaintLevel } from '@security/taint/TaintTracker';

/**
 * Type of resolver - determines what operations it supports
 */
export type ResolverType = 'input' | 'output' | 'io';

/**
 * Content returned by a resolver
 */
export interface ResolverContent {
  content: string;
  metadata?: {
    source: string;
    timestamp: Date;
    author?: string;
    hash?: string;
    taintLevel?: TaintLevel;
    mimeType?: string;
    size?: number;
  };
}

/**
 * Information about available content (for list operations)
 */
export interface ContentInfo {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: Date;
  metadata?: Record<string, any>;
}

/**
 * Reference to a module/resource
 */
export interface ModuleReference {
  type: 'ModuleReference';
  namespace: string;
  path?: string[];
  name: string;
  hash?: string;
  security?: SecurityOptions;
}

/**
 * Security options for module references
 */
export interface SecurityOptions {
  ttl?: number;
  trust?: 'high' | 'medium' | 'low';
  requireHash?: boolean;
}

/**
 * Core resolver interface - all resolvers must implement this
 */
export interface Resolver {
  /**
   * Unique name for this resolver
   */
  name: string;

  /**
   * Human-readable description
   */
  description: string;

  /**
   * Type of resolver - determines supported operations
   */
  type: ResolverType;

  /**
   * Check if this resolver can handle a given reference
   * @param ref The reference to check (e.g., "@notes/daily/2024-01-01")
   * @param config Resolver-specific configuration
   */
  canResolve(ref: string, config?: any): boolean;

  /**
   * Resolve a reference to content
   * @param ref The reference to resolve
   * @param config Resolver-specific configuration
   * @throws MlldResolutionError if resolution fails
   */
  resolve(ref: string, config?: any): Promise<ResolverContent>;

  /**
   * Write content to a reference (output resolvers only)
   * @param ref The reference to write to
   * @param content The content to write
   * @param config Resolver-specific configuration
   * @throws MlldOutputError if write fails
   */
  write?(ref: string, content: string, config?: any): Promise<void>;

  /**
   * List available content under a prefix
   * @param prefix The prefix to list under
   * @param config Resolver-specific configuration
   */
  list?(prefix: string, config?: any): Promise<ContentInfo[]>;

  /**
   * Validate resolver configuration
   * @param config The configuration to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateConfig?(config: any): string[];

  /**
   * Check if an operation is allowed
   * @param ref The reference to check
   * @param operation The operation type
   * @param config Resolver-specific configuration
   */
  checkAccess?(ref: string, operation: 'read' | 'write', config?: any): Promise<boolean>;
}

/**
 * Registry configuration for a resolver
 */
export interface RegistryConfig {
  /**
   * Prefix pattern this resolver handles (e.g., "@notes/", "@company/")
   */
  prefix: string;

  /**
   * Resolver name or path to custom resolver
   */
  resolver: string;

  /**
   * Type of resolver
   */
  type: ResolverType;

  /**
   * Resolver-specific configuration
   */
  config?: any;

  /**
   * Optional description for this registry entry
   */
  description?: string;
}

/**
 * Security policy for resolvers
 */
export interface ResolverSecurityPolicy {
  /**
   * Whether custom resolvers are allowed
   */
  allowCustom: boolean;

  /**
   * List of allowed resolver names (if specified, only these can be used)
   */
  allowedResolvers?: string[];

  /**
   * Whether to enforce path-only mode (no direct filesystem access)
   */
  pathOnlyMode: boolean;

  /**
   * Whether to allow output operations
   */
  allowOutputs?: boolean;

  /**
   * Maximum resolver timeout in milliseconds
   */
  timeout?: number;
}

/**
 * Options for resolver operations
 */
export interface ResolverOptions {
  /**
   * Base path for relative references
   */
  basePath?: string;

  /**
   * Security policy to enforce
   */
  securityPolicy?: ResolverSecurityPolicy;

  /**
   * Whether to use cache
   */
  useCache?: boolean;

  /**
   * Additional metadata to include
   */
  metadata?: Record<string, any>;
}

/**
 * Result of resolver manager resolution
 */
export interface ResolutionResult {
  /**
   * The resolved content
   */
  content: ResolverContent;

  /**
   * Name of the resolver that handled the request
   */
  resolverName: string;

  /**
   * The prefix that matched (if any)
   */
  matchedPrefix?: string;

  /**
   * Time taken for resolution in milliseconds
   */
  resolutionTime?: number;
}