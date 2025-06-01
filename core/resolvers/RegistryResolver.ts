import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo
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
 * Registry format from registry.json files
 */
interface RegistryFile {
  version?: string;
  updated?: string;
  author: string;
  modules: Record<string, {
    name: string;
    description: string;
    author: {
      name: string;
      github: string;
    };
    source: {
      type: string;
      repo: string;
      hash: string;
      url: string;
    };
    dependencies: Record<string, string>;
    keywords: string[];
    mlldVersion: string;
    publishedAt: string;
  }>;
}

/**
 * Registry Resolver - resolves @user/module patterns using GitHub registry
 * This is the primary resolver for public modules in RC phase
 */
export class RegistryResolver implements Resolver {
  name = 'registry';
  description = 'Resolves public modules using GitHub registry at mlld-lang/registry';
  type: ResolverType = 'input';

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
        `Invalid registry module reference format. Expected @user/module, got: ${ref}`,
        { reference: ref }
      );
    }

    const [user, moduleName] = ref.slice(1).split('/');
    const registryRepo = config?.registryRepo || this.defaultRegistryRepo;
    const branch = config?.branch || this.defaultBranch;

    logger.debug(`Resolving ${ref} from registry: ${registryRepo}`);

    try {
      // Fetch user's registry file
      const registryFile = await this.fetchUserRegistry(user, registryRepo, branch, config);
      
      // Look up the module - try both full name (@user/module) and just module name
      const fullModuleName = `@${user}/${moduleName}`;
      let moduleEntry = registryFile.modules[fullModuleName] || registryFile.modules[moduleName];
      
      if (!moduleEntry) {
        throw new MlldResolutionError(
          `Module '${moduleName}' not found in ${user}'s registry`,
          { 
            reference: ref,
            availableModules: Object.keys(registryFile.modules)
          }
        );
      }

      // Get the source URL directly from the registry
      const sourceUrl = moduleEntry.source.url;
      
      logger.debug(`Resolved ${ref} to source: ${sourceUrl}`);

      // Fetch the module content
      const moduleContent = await this.fetchModuleContent(sourceUrl, config?.token);

      return {
        content: moduleContent,
        metadata: {
          source: `registry://${ref}`,
          timestamp: new Date(),
          taintLevel: TaintLevel.PUBLIC,
          author: user,
          mimeType: 'text/x-mlld',
          description: moduleEntry.description,
          sourceUrl: sourceUrl,
          sourceHash: moduleEntry.source.hash
        }
      };
    } catch (error) {
      if (error instanceof MlldResolutionError) {
        throw error;
      }
      throw new MlldResolutionError(
        `Failed to resolve ${ref} from registry: ${error.message}`,
        { 
          reference: ref,
          registryRepo,
          user,
          moduleName,
          originalError: error
        }
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
   * Fetch a user's registry file from GitHub
   */
  private async fetchUserRegistry(
    username: string, 
    registryRepo: string, 
    branch: string,
    config?: RegistryResolverConfig
  ): Promise<RegistryFile> {
    const cacheKey = `${registryRepo}:${branch}:${username}`;
    
    // Check cache first
    const cached = this.getCachedRegistry(cacheKey, config?.cacheTimeout);
    if (cached) {
      logger.debug(`Registry cache hit for user: ${username}`);
      return cached;
    }

    // Construct GitHub raw URL - registry uses modules/{username}/registry.json structure
    const registryUrl = `https://raw.githubusercontent.com/${registryRepo}/${branch}/modules/${username}/registry.json`;
    
    logger.debug(`Fetching registry for ${username} from: ${registryUrl}`);

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
          `User '${username}' not found in registry`,
          { username, registryUrl }
        );
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const registryData = await response.json();
    
    // Validate registry format
    this.validateRegistryFile(registryData, username);
    
    // Cache the result
    this.cache.set(cacheKey, {
      content: registryData,
      timestamp: Date.now()
    });

    logger.debug(`Cached registry for ${username} with ${Object.keys(registryData.modules || {}).length} modules`);

    return registryData;
  }

  /**
   * Fetch module content from source URL
   */
  private async fetchModuleContent(sourceUrl: string, token?: string): Promise<string> {
    logger.debug(`Fetching module content from: ${sourceUrl}`);

    const headers: HeadersInit = {
      'User-Agent': 'mlld-registry-resolver'
    };

    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(sourceUrl, { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch module: ${response.status} ${response.statusText}`);
    }

    return response.text();
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
  private validateRegistryFile(data: any, username: string): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Registry file must be a valid JSON object');
    }

    if (!data.author) {
      throw new Error('Registry file missing author field');
    }

    if (data.author !== username) {
      throw new Error(`Registry author '${data.author}' does not match username '${username}'`);
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
      if (!module.source || typeof module.source !== 'object') {
        throw new Error(`Module '${moduleName}' missing or invalid source field`);
      }

      if (!module.source.url || typeof module.source.url !== 'string') {
        throw new Error(`Module '${moduleName}' missing or invalid source.url field`);
      }

      if (!module.description || typeof module.description !== 'string') {
        throw new Error(`Module '${moduleName}' missing or invalid description field`);
      }
    }
  }
}