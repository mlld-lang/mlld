import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo,
  ResolverCapabilities
} from '@core/resolvers/types';
import { MlldResolutionError } from '@core/errors';
import type { TaintLevel } from '@core/types/security';
import { logger } from '@core/utils/logger';
import { parseSemVer, compareSemVer, satisfiesVersion } from '@core/utils/version-checker';

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
 * Module reference format for version support
 */
interface ModuleReference {
  author: string;
  module: string;
  version?: string;      // "1.0.0", "^1.0.0", "beta"
  isTag?: boolean;       // true if version is a tag like "beta"
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
    // New fields for version support
    availableVersions?: string[];
    tags?: Record<string, string>;
    owners?: string[];
    maintainers?: string[];
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
   * Parse module reference with version support
   */
  private parseModuleReference(ref: string): ModuleReference {
    // @author/module@version or @author/module
    const match = ref.match(/^@([^/]+)\/([^@]+)(?:@(.+))?$/);
    if (!match) {
      throw new MlldResolutionError(
        `Invalid module reference format. Expected @user/module or @user/module@version, got: ${ref}`
      );
    }
    
    const [, author, module, version] = match;
    const isTag = version && !(/^[\d^~<>=]/.test(version));
    
    return { author, module, version, isTag };
  }

  /**
   * Check if this resolver can handle the reference
   * Registry resolver handles @user/module pattern with optional version
   */
  canResolve(ref: string, config?: RegistryResolverConfig): boolean {
    // Must start with @
    if (!ref.startsWith('@')) return false;
    
    try {
      this.parseModuleReference(ref);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve version for a module
   */
  private resolveVersion(
    available: string[],
    requested: string
  ): string | null {
    // Handle tags are resolved by caller
    
    // Sort versions in descending order
    const sorted = available
      .filter(v => satisfiesVersion(v, requested))
      .sort((a, b) => {
        const va = parseSemVer(a);
        const vb = parseSemVer(b);
        return compareSemVer(vb, va);
      });
    
    return sorted[0] || null;
  }

  /**
   * Fetch version-specific data from API or GitHub
   */
  private async fetchVersionData(
    author: string,
    module: string,
    version: string,
    registryRepo: string,
    branch: string,
    config?: RegistryResolverConfig
  ): Promise<any> {
    // For now, fetch directly from GitHub
    // Later this will use the API
    const versionUrl = `https://raw.githubusercontent.com/${registryRepo}/${branch}/modules/${author}/${module}/${version}.json`;
    
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'User-Agent': 'mlld-registry-resolver'
    };

    if (config?.token) {
      headers['Authorization'] = `token ${config.token}`;
    }

    const response = await fetch(versionUrl, { headers });
    
    if (!response.ok) {
      throw new MlldResolutionError(
        `Failed to fetch version data for @${author}/${module}@${version}: ${response.status}`
      );
    }
    
    return response.json();
  }

  /**
   * Resolve a module reference using GitHub registry
   */
  async resolve(ref: string, config?: RegistryResolverConfig): Promise<ResolverContent> {
    // Parse version from reference
    const { author, module, version, isTag } = this.parseModuleReference(ref);
    const moduleKey = `@${author}/${module}`;

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
      
      // Look up the module
      const moduleEntry = registryFile.modules[moduleKey];
      
      if (!moduleEntry) {
        throw new MlldResolutionError(
          `Module '${module}' not found in ${author}'s registry`
        );
      }
      
      // Resolve version
      let resolvedVersion = moduleEntry.version; // Default to latest
      let versionData = moduleEntry; // Use registry data by default
      
      if (version) {
        if (isTag && moduleEntry.tags?.[version]) {
          // Resolve tag to version
          resolvedVersion = moduleEntry.tags[version];
          logger.debug(`Resolved tag '${version}' to version ${resolvedVersion}`);
        } else if (moduleEntry.availableVersions) {
          // Use version resolver
          const resolved = this.resolveVersion(
            moduleEntry.availableVersions,
            version || 'latest'
          );
          if (!resolved) {
            throw new MlldResolutionError(
              `No version matching '${version}' for ${moduleKey}\nAvailable versions: ${moduleEntry.availableVersions.join(', ')}`
            );
          }
          resolvedVersion = resolved;
        } else if (version !== moduleEntry.version) {
          // Backward compat: only one version available
          throw new MlldResolutionError(
            `Version ${version} not found for ${moduleKey}. Only version ${moduleEntry.version} is available.`
          );
        }
      }
      
      // For non-latest versions, fetch version-specific data
      if (resolvedVersion !== moduleEntry.version && moduleEntry.availableVersions) {
        logger.debug(`Fetching version data for ${moduleKey}@${resolvedVersion}`);
        versionData = await this.fetchVersionData(
          author, module, resolvedVersion,
          registryRepo, branch, registryConfig
        );
      }
      
      // Get the source URL
      const sourceUrl = versionData.source.url;
      
      logger.debug(`Resolved ${ref} to ${moduleKey}@${resolvedVersion} at ${sourceUrl}`);

      // Fetch the actual module content from the source URL
      logger.debug(`Fetching module content from: ${sourceUrl}`);
      
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        // Check for 404 specifically
        if (response.status === 404) {
          throw new MlldResolutionError(
            `Module content not found at ${sourceUrl}. The module may have been moved or deleted.`
          );
        }
        throw new MlldResolutionError(
          `Failed to fetch module content from ${sourceUrl}: ${response.status} ${response.statusText}`
        );
      }
      
      const content = await response.text();
      
      // Validate we got actual content, not an error page
      if (!content || content.length === 0) {
        throw new MlldResolutionError(
          `Module content is empty at ${sourceUrl}`
        );
      }
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.log(`[RegistryResolver] Resolved to version: ${resolvedVersion}`);
        console.log(`[RegistryResolver] Fetched content from ${sourceUrl}`);
        console.log(`[RegistryResolver] Fetched content length: ${content.length}`);
        console.log(`[RegistryResolver] First 200 chars:`, content.substring(0, 200));
      }
      
      return {
        content,
        contentType: 'module',
        metadata: {
          source: `registry://${moduleKey}@${resolvedVersion}`,
          timestamp: new Date(),
          taintLevel: 'module' as TaintLevel,
          author: moduleEntry.author,
          mimeType: 'text/x-mlld-module',
          hash: versionData.source.contentHash,
          sourceUrl,
          version: resolvedVersion
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
