import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo,
  ResolverCapabilities
} from '@core/resolvers/types';
import { MlldResolutionError } from '@core/errors';
import { TaintLevel } from '@security/taint/TaintTracker';
import { logger } from '@core/utils/logger';

/**
 * Configuration for RegistryResolver
 */
export interface RegistryResolverConfig {
  /**
   * Registry repository URL (defaults to mlld-lang/registry)
   */
  registryRepo?: string;
  
  /**
   * Branch to use (defaults to main)
   */
  branch?: string;
  
  /**
   * Cache timeout in milliseconds (defaults to 5 minutes)
   */
  cacheTimeout?: number;
  
  /**
   * GitHub API token for rate limiting (optional)
   */
  token?: string;
}

/**
 * Registry format from centralized modules.json file
 */
interface RegistryFile {
  version?: string;
  generated?: string;
  modules: Record<string, {
    name: string;
    author: string;
    version?: string;
    about: string;
    needs: string[];
    repo?: string;
    keywords?: string[];
    bugs?: string;
    homepage?: string;
    license: string;
    mlldVersion?: string;
    ownerGithubUserIds?: number[];
    source: {
      type: string;
      url: string;
      contentHash: string;
      repository?: {
        type: string;
        url: string;
        commit: string;
        path: string;
      };
      gistId?: string;
    };
    dependencies?: Record<string, any>;
    publishedAt: string;
    publishedBy?: number;
  }>;
}

/**
 * Registry Resolver - resolves @user/module patterns using GitHub registry
 * This is the primary resolver for public modules in RC phase
 */
export class RegistryResolver implements Resolver {
  name = 'REGISTRY';
  description = 'Resolves public modules using GitHub registry at mlld-lang/registry';
  type: ResolverType = 'input';
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['module'],
    defaultContentType: 'module',
    priority: 10, // Higher priority than file resolvers
    cache: { 
      strategy: 'persistent',
      ttl: { duration: 300 } // 5 minutes
    }
  };

  private readonly cache: Map<string, { content: RegistryFile; timestamp: number }> = new Map();
  private readonly defaultCacheTimeout = 300000; // 5 minutes
  private readonly defaultRegistryRepo = 'mlld-lang/registry';
  private readonly defaultBranch = 'main';

  /**
   * Check if this resolver can handle the reference
   * Registry resolver handles @user/module pattern
   */
  canResolve(ref: string, config?: RegistryResolverConfig): boolean {
    // Must start with @ and have exactly one /
    if (!ref.startsWith('@')) return false;
    
    const parts = ref.slice(1).split('/');
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
  }

  /**
   * Resolve a module reference using GitHub registry
   */
  async resolve(ref: string, config?: RegistryResolverConfig): Promise<ResolverContent> {
    if (!this.canResolve(ref, config)) {
      throw new MlldResolutionError(
        `Invalid registry module reference format. Expected @user/module, got: ${ref}`
      );
    }

    // Extract only the RegistryResolverConfig fields, ignore extra fields from ResolverManager
    const registryConfig: RegistryResolverConfig = {
      registryRepo: config?.registryRepo,
      branch: config?.branch,
      cacheTimeout: config?.cacheTimeout,
      token: config?.token
    };

    const registryRepo = registryConfig.registryRepo || this.defaultRegistryRepo;
    const branch = registryConfig.branch || this.defaultBranch;

    logger.debug(`Resolving ${ref} from registry: ${registryRepo}`);

    try {
      // Fetch the centralized registry file
      const registryFile = await this.fetchRegistry(registryRepo, branch, registryConfig);
      
      // Look up the module using the full @user/module format
      const moduleEntry = registryFile.modules[ref];
      
      if (!moduleEntry) {
        const [user, moduleName] = ref.slice(1).split('/');
        throw new MlldResolutionError(
          `Module '${moduleName}' not found in ${user}'s registry`
        );
      }
      
      // Get the source URL directly from the registry
      const sourceUrl = moduleEntry.source.url;
      
      logger.debug(`Resolved ${ref} to source: ${sourceUrl}`);

      // Return the URL as content - the actual fetching will be done by HTTPResolver/GitHubResolver
      return {
        content: sourceUrl,
        contentType: 'module',
        metadata: {
          source: `registry://${ref}`,
          timestamp: new Date(),
          taintLevel: (TaintLevel as any).PUBLIC,
          author: moduleEntry.author,
          mimeType: 'text/plain', // URL is plain text
          hash: moduleEntry.source.contentHash
        }
      };
    } catch (error) {
      if (error instanceof MlldResolutionError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MlldResolutionError(
        `Failed to resolve ${ref} from registry: ${errorMessage}`
      );
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config: any): string[] {
    const errors: string[] = [];

    if (config?.registryRepo !== undefined && typeof config.registryRepo !== 'string') {
      errors.push('registryRepo must be a string');
    }

    if (config?.branch !== undefined && typeof config.branch !== 'string') {
      errors.push('branch must be a string');
    }

    if (config?.cacheTimeout !== undefined) {
      if (typeof config.cacheTimeout !== 'number' || config.cacheTimeout < 0) {
        errors.push('cacheTimeout must be a non-negative number');
      }
    }

    if (config?.token !== undefined && typeof config.token !== 'string') {
      errors.push('token must be a string');
    }

    return errors;
  }

  /**
   * Check access - registry modules are always public/readable
   */
  async checkAccess(ref: string, operation: 'read' | 'write', config?: RegistryResolverConfig): Promise<boolean> {
    if (operation === 'write') {
      return false; // Registry is read-only
    }
    return this.canResolve(ref, config);
  }

  /**
   * Fetch the centralized registry file from GitHub
   */
  private async fetchRegistry(
    registryRepo: string, 
    branch: string,
    config?: RegistryResolverConfig
  ): Promise<RegistryFile> {
    const cacheKey = `${registryRepo}:${branch}:modules`;
    
    // Check cache first
    const cached = this.getCachedRegistry(cacheKey, config?.cacheTimeout);
    if (cached) {
      logger.debug(`Registry cache hit`);
      return cached;
    }

    // Construct GitHub raw URL - use centralized modules.json
    const registryUrl = `https://raw.githubusercontent.com/${registryRepo}/${branch}/modules.json`;
    
    logger.debug(`Fetching registry from: ${registryUrl}`);

    // Fetch from GitHub
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'User-Agent': 'mlld-registry-resolver'
    };

    if (config?.token) {
      headers['Authorization'] = `token ${config.token}`;
    }

    const response = await fetch(registryUrl, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new MlldResolutionError(
          `Registry not found at ${registryUrl}. The registry may be unavailable.`,
          { registryUrl }
        );
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const registryData = await response.json();
    
    // Validate registry format
    this.validateRegistryFile(registryData);
    
    // Cache the result
    this.cache.set(cacheKey, {
      content: registryData,
      timestamp: Date.now()
    });

    logger.debug(`Cached registry with ${Object.keys(registryData.modules || {}).length} modules`);

    return registryData;
  }


  /**
   * Get cached registry if available and not expired
   */
  private getCachedRegistry(cacheKey: string, timeout?: number): RegistryFile | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    const maxAge = timeout || this.defaultCacheTimeout;
    if (Date.now() - cached.timestamp > maxAge) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.content;
  }

  /**
   * Validate registry file format
   */
  private validateRegistryFile(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Registry file must be a valid JSON object');
    }

    if (!data.version) {
      throw new Error('Registry file missing version field');
    }

    if (!data.modules || typeof data.modules !== 'object') {
      throw new Error('Registry file missing or invalid modules field');
    }

    // Validate each module entry
    for (const [moduleName, moduleData] of Object.entries(data.modules)) {
      if (!moduleData || typeof moduleData !== 'object') {
        throw new Error(`Invalid module entry for '${moduleName}'`);
      }

      const module = moduleData as any;
      
      // Validate required fields
      if (!module.name || typeof module.name !== 'string') {
        throw new Error(`Module '${moduleName}' missing or invalid name field`);
      }

      if (!module.author || typeof module.author !== 'string') {
        throw new Error(`Module '${moduleName}' missing or invalid author field`);
      }

      if (!module.about || typeof module.about !== 'string') {
        throw new Error(`Module '${moduleName}' missing or invalid about field`);
      }

      if (!module.source || typeof module.source !== 'object') {
        throw new Error(`Module '${moduleName}' missing or invalid source field`);
      }

      if (!module.source.url || typeof module.source.url !== 'string') {
        throw new Error(`Module '${moduleName}' missing or invalid source.url field`);
      }

      if (!module.source.contentHash || typeof module.source.contentHash !== 'string') {
        throw new Error(`Module '${moduleName}' missing or invalid source.contentHash field`);
      }

      if (!Array.isArray(module.needs)) {
        throw new Error(`Module '${moduleName}' missing or invalid needs field (must be array)`);
      }

      if (module.license !== 'CC0') {
        throw new Error(`Module '${moduleName}' must have CC0 license`);
      }
    }
  }
}