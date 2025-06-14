import { 
  Resolver, 
  ResolverContent, 
  ResolutionResult, 
  RegistryConfig, 
  ResolverSecurityPolicy,
  ResolverOptions,
  ContentInfo,
  ResolutionContext
} from '@core/resolvers/types';
import { MlldResolutionError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { ModuleCache, LockFile } from '@core/registry';
import { HashUtils } from '@core/registry/utils/HashUtils';
import { hasUncommittedChanges, getGitStatus } from '@core/utils/gitStatus';
import * as path from 'path';

/**
 * Manages resolver registration, routing, and execution
 */
export class ResolverManager {
  private resolvers: Map<string, Resolver> = new Map();
  private resolversByPriority: Resolver[] = [];
  private resolverNamesCache: Set<string> = new Set(); // Cache all resolver name variants
  private registries: RegistryConfig[] = [];
  private securityPolicy: ResolverSecurityPolicy;
  private moduleCache?: ModuleCache;
  private lockFile?: LockFile;
  private offlineMode: boolean = false;
  private devMode: boolean = false;

  constructor(
    securityPolicy?: ResolverSecurityPolicy,
    moduleCache?: ModuleCache,
    lockFile?: LockFile
  ) {
    this.securityPolicy = securityPolicy || {
      allowCustom: false,
      pathOnlyMode: false,
      allowOutputs: true,
      timeout: 30000
    };
    this.moduleCache = moduleCache;
    this.lockFile = lockFile;
  }

  /**
   * Set offline mode - prefer cache over network
   */
  setOfflineMode(offline: boolean): void {
    this.offlineMode = offline;
    logger.debug(`Offline mode: ${offline}`);
  }

  /**
   * Set module cache
   */
  setModuleCache(cache: ModuleCache): void {
    this.moduleCache = cache;
  }

  /**
   * Set lock file
   */
  setLockFile(lockFile: LockFile): void {
    this.lockFile = lockFile;
  }

  /**
   * Set development mode - enables local fallback
   */
  setDevMode(devMode: boolean): void {
    this.devMode = devMode;
    logger.debug(`Development mode: ${devMode}`);
  }

  /**
   * Register a built-in resolver
   */
  registerResolver(resolver: Resolver): void {
    if (this.resolvers.has(resolver.name)) {
      throw new Error(`Resolver '${resolver.name}' is already registered`);
    }

    // Validate against security policy
    if (this.securityPolicy.allowedResolvers && 
        !this.securityPolicy.allowedResolvers.includes(resolver.name)) {
      throw new Error(`Resolver '${resolver.name}' is not in the allowed list`);
    }

    this.resolvers.set(resolver.name, resolver);
    
    // Add to priority-sorted array
    this.resolversByPriority.push(resolver);
    this.resolversByPriority.sort((a, b) => a.capabilities.priority - b.capabilities.priority);
    
    // Update resolver names cache with all variants
    this.resolverNamesCache.add(resolver.name);
    this.resolverNamesCache.add(resolver.name.toUpperCase());
    this.resolverNamesCache.add(resolver.name.toLowerCase());
    
    logger.debug(`Registered resolver: ${resolver.name} (priority: ${resolver.capabilities.priority})`);
  }

  /**
   * Configure registries from lock file or config
   */
  configureRegistries(registries: RegistryConfig[]): void {
    // Validate all registries first
    for (const registry of registries) {
      this.validateRegistry(registry);
    }

    // Sort by prefix length (longest first) for proper matching
    this.registries = registries.sort((a, b) => b.prefix.length - a.prefix.length);
    logger.debug(`Configured ${registries.length} registries`);
  }

  /**
   * Resolve a module reference
   */
  async resolve(ref: string, options?: ResolverOptions): Promise<ResolutionResult> {
    const startTime = Date.now();

    // 1. Check if we have a hash for this module in lock file
    if (this.lockFile && this.moduleCache) {
      const lockEntry = this.lockFile.getImport(ref);
      if (lockEntry?.integrity) {
        // Extract hash from integrity (format: "sha256:hash")
        const hash = lockEntry.integrity.split(':')[1];
        if (hash) {
          // Try to get from cache
          try {
            const cached = await this.moduleCache.get(hash);
            if (cached) {
              logger.debug(`Cache hit for ${ref} (hash: ${hash})`);
              const resolutionTime = Date.now() - startTime;
              
              return {
                content: {
                  content: cached.content,
                  metadata: {
                    source: cached.metadata?.source || ref,
                    timestamp: cached.metadata?.timestamp || new Date(),
                    hash: cached.hash,
                    size: cached.metadata?.size
                  }
                },
                resolverName: 'cache',
                matchedPrefix: undefined,
                resolutionTime
              };
            }
          } catch (cacheError: any) {
            // Log cache error and fall through to re-resolution
            logger.warn(`Cache error for ${ref}: ${cacheError.message}`);
            // If it's a corruption error, we should clear the lock entry
            if (cacheError.message.includes('Cache corruption detected')) {
              await this.lockFile.removeImport(ref);
              logger.info(`Cleared corrupted cache entry for ${ref}`);
            }
          }
          
          if (this.offlineMode) {
            // In offline mode, fail if not in cache
            throw new MlldResolutionError(
              `Module '${ref}' not available in offline mode`,
              { reference: ref, hash }
            );
          }
        }
      } else if (this.offlineMode) {
        // In offline mode with no lock entry, fail immediately
        throw new MlldResolutionError(
          `Module '${ref}' not available in offline mode`,
          { reference: ref }
        );
      }
    } else if (this.offlineMode && (!this.lockFile || !this.moduleCache)) {
      // Offline mode requires both lock file and cache
      throw new MlldResolutionError(
        'Offline mode requires lock file and cache to be configured',
        { reference: ref }
      );
    }

    // 2. Find matching registry by prefix
    const { resolver, registry } = await this.findResolver(ref, options?.context);

    if (!resolver) {
      throw new MlldResolutionError(
        `No resolver found for reference: ${ref}`,
        { reference: ref, context: options?.context }
      );
    }

    // Check if resolver supports the requested context
    if (options?.context && !this.canResolveInContext(resolver, options.context)) {
      throw new MlldResolutionError(
        `Resolver '${resolver.name}' does not support ${options.context} operations`,
        { reference: ref, resolverName: resolver.name, context: options.context }
      );
    }

    // Check if resolver supports input operations
    if (resolver.type === 'output') {
      throw new MlldResolutionError(
        `Resolver '${resolver.name}' does not support input operations`,
        { reference: ref, resolverName: resolver.name }
      );
    }

    // Strip prefix from reference for resolver operations
    let resolverRef = ref;
    if (registry?.prefix && ref.startsWith(registry.prefix)) {
      resolverRef = ref.slice(registry.prefix.length);
    }

    // Check access if supported
    if (resolver.checkAccess) {
      const hasAccess = await resolver.checkAccess(resolverRef, 'read', registry?.config);
      if (!hasAccess) {
        throw new MlldResolutionError(
          `Access denied for reference: ${ref}`,
          { reference: ref, resolverName: resolver.name }
        );
      }
    }

    try {
      // 3. Resolve fresh from source
      const timeoutMs = options?.securityPolicy?.timeout || this.securityPolicy.timeout;
      
      // Merge registry config with options
      const resolverConfig = {
        ...registry?.config,
        context: options?.context,
        prefix: registry?.prefix
      };
      
      const content = await this.withTimeout(
        resolver.resolve(resolverRef, resolverConfig),
        timeoutMs || 30000
      );

      // 4. Cache the content if cache is available
      if (this.moduleCache && content.content) {
        try {
          const cacheEntry = await this.moduleCache.store(
            content.content,
            content.metadata?.source || ref,
            ref
          );
          
          // Add hash to metadata
          content.metadata = {
            ...content.metadata,
            hash: cacheEntry.hash
          };
          
          // 5. Update lock file with new hash
          if (this.lockFile) {
            await this.lockFile.addImport(ref, {
              resolved: content.metadata.source || ref,
              integrity: `sha256:${cacheEntry.hash}`,
              approvedAt: new Date().toISOString()
            });
          }
          
          logger.debug(`Cached ${ref} with hash ${cacheEntry.hash}`);
        } catch (cacheError) {
          // Log but don't fail resolution if caching fails
          logger.warn(`Failed to cache ${ref}: ${cacheError.message}`);
        }
      }

      const resolutionTime = Date.now() - startTime;

      // Check for dirty state if not using LOCAL resolver
      if (resolver.name !== 'LOCAL' && registry?.config?.basePath) {
        // Add .mlld.md extension if not present
        let fileName = resolverRef;
        if (!fileName.includes('.')) {
          fileName += '.mlld.md';
        }
        const localPath = path.join(process.cwd(), registry.config.basePath, fileName);
        
        // Check if local file exists and has uncommitted changes
        const gitStatus = await getGitStatus(localPath);
        if (gitStatus === 'modified' || gitStatus === 'untracked') {
          const statusEmoji = gitStatus === 'modified' ? '📝' : '🆕';
          const statusText = gitStatus === 'modified' ? 'modified' : 'untracked';
          
          console.warn(`\n${statusEmoji} Local ${statusText} version detected for ${registry.prefix}${resolverRef}`);
          console.warn(`   Remote: Using ${resolver.name} resolver`);
          console.warn(`   Local:  ${localPath}`);
          console.warn(`   Hint:   Use --dev flag to test with local version`);
          console.warn(`           mlld run myfile.mld --dev\n`);
        }
      }

      return {
        content,
        resolverName: resolver.name,
        matchedPrefix: registry?.prefix,
        resolutionTime
      };
    } catch (error) {
      // In dev mode, if the error indicates a local file exists, try LOCAL resolver
      if (this.devMode && error instanceof MlldResolutionError) {
        const errorDetails = (error as any).details;
        logger.debug(`Dev mode check: devMode=${this.devMode}, hasLocal=${errorDetails?.hasLocal}, error=${error.message}`);
        if (errorDetails?.hasLocal) {
          logger.info(`Dev mode: Falling back to local version of ${ref}`);
          
          // Find LOCAL resolver
          const localResolver = this.resolvers.get('LOCAL');
          if (localResolver) {
            try {
              // Extract the module name from the reference
              const moduleName = resolverRef;
              
              // Try to resolve using LOCAL resolver
              const localContent = await localResolver.resolve(moduleName, {
                basePath: registry?.config?.basePath || process.cwd()
              });
              
              // Log warning about using local version
              console.warn(`⚠️  Using local version of ${ref} (not yet published)`);
              console.warn(`   Local: ${errorDetails.localPath || errorDetails.path || moduleName}`);
              console.warn(`   To publish: mlld publish ${errorDetails.localPath || errorDetails.path || moduleName}`);
              
              const resolutionTime = Date.now() - startTime;
              
              return {
                content: localContent,
                resolverName: 'LOCAL (dev fallback)',
                matchedPrefix: registry?.prefix,
                resolutionTime
              };
            } catch (localError) {
              // If local resolution also fails, throw the original error
              logger.debug(`Local fallback failed: ${localError.message}`);
            }
          }
        }
      }
      
      if (error instanceof MlldResolutionError) {
        throw error;
      }
      throw new MlldResolutionError(
        `Failed to resolve '${ref}' using ${resolver.name}: ${error.message}`,
        { 
          reference: ref, 
          resolverName: resolver.name,
          originalError: error
        }
      );
    }
  }

  /**
   * Write content using an output resolver
   */
  async write(ref: string, content: string, options?: ResolverOptions): Promise<void> {
    if (!this.securityPolicy.allowOutputs) {
      throw new MlldResolutionError(
        'Output operations are not allowed by security policy',
        { reference: ref }
      );
    }

    const { resolver, registry } = await this.findResolver(ref, undefined);

    if (!resolver) {
      throw new MlldResolutionError(
        `No resolver found for reference: ${ref}`,
        { reference: ref }
      );
    }

    // Check if resolver supports output operations
    if (resolver.type === 'input' || !resolver.write) {
      throw new MlldResolutionError(
        `Resolver '${resolver.name}' does not support output operations`,
        { reference: ref, resolverName: resolver.name }
      );
    }

    // Strip prefix from reference for resolver operations
    let resolverRef = ref;
    if (registry?.prefix && ref.startsWith(registry.prefix)) {
      resolverRef = ref.slice(registry.prefix.length);
    }

    // Check access if supported
    if (resolver.checkAccess) {
      const hasAccess = await resolver.checkAccess(resolverRef, 'write', registry?.config);
      if (!hasAccess) {
        throw new MlldResolutionError(
          `Write access denied for reference: ${ref}`,
          { reference: ref, resolverName: resolver.name }
        );
      }
    }

    try {
      await resolver.write(resolverRef, content, registry?.config);
    } catch (error) {
      throw new MlldResolutionError(
        `Failed to write '${ref}' using ${resolver.name}: ${error.message}`,
        { 
          reference: ref, 
          resolverName: resolver.name,
          originalError: error
        }
      );
    }
  }

  /**
   * List available content under a prefix
   */
  async list(prefix: string, options?: ResolverOptions): Promise<ContentInfo[]> {
    const { resolver, registry } = await this.findResolver(prefix, undefined);

    if (!resolver || !resolver.list) {
      return [];
    }

    // Strip prefix from reference for resolver operations
    let resolverPrefix = prefix;
    if (registry?.prefix && prefix.startsWith(registry.prefix)) {
      resolverPrefix = prefix.slice(registry.prefix.length);
    }

    try {
      return await resolver.list(resolverPrefix, registry?.config);
    } catch (error) {
      logger.warn(`Failed to list content for '${prefix}': ${error.message}`);
      return [];
    }
  }

  /**
   * Get a specific resolver by name
   */
  getResolver(name: string): Resolver | undefined {
    return this.resolvers.get(name);
  }

  /**
   * Get all registered resolver names
   */
  getResolverNames(): string[] {
    return Array.from(this.resolvers.keys());
  }

  /**
   * Get all resolver name variants (for name protection)
   * Returns a Set for O(1) lookups
   */
  getResolverNamesSet(): Set<string> {
    return new Set(this.resolverNamesCache);
  }

  /**
   * Get configured registries
   */
  getRegistries(): RegistryConfig[] {
    return [...this.registries];
  }

  /**
   * Check if a resolver can handle a reference in a given context
   */
  canResolveInContext(resolver: Resolver, context: ResolutionContext): boolean {
    switch (context) {
      case 'import':
        return resolver.capabilities.contexts.import;
      case 'path':
        return resolver.capabilities.contexts.path;
      case 'output':
        return resolver.capabilities.contexts.output;
      case 'variable':
        // Variables can use any resolver that supports import context
        return resolver.capabilities.contexts.import;
      default:
        return true;
    }
  }

  /**
   * Get all resolvers that can handle a given context
   */
  getResolversForContext(context: ResolutionContext): Resolver[] {
    return this.resolversByPriority.filter(r => this.canResolveInContext(r, context));
  }

  /**
   * Check if a name is a known resolver (for name protection)
   * O(1) lookup using cached set
   */
  isResolverName(name: string): boolean {
    return this.resolverNamesCache.has(name) || 
           this.resolverNamesCache.has(name.toUpperCase()) || 
           this.resolverNamesCache.has(name.toLowerCase());
  }

  /**
   * Find the appropriate resolver for a reference
   */
  private async findResolver(ref: string, context?: ResolutionContext): Promise<{ resolver?: Resolver, registry?: RegistryConfig }> {
    // First, check configured registries (sorted by prefix length)
    // This ensures that explicit registry configurations take precedence
    for (const registry of this.registries) {
      if (ref.startsWith(registry.prefix)) {
        const resolver = this.resolvers.get(registry.resolver);
        // Strip prefix from reference before checking canResolve
        const resolverRef = ref.slice(registry.prefix.length);
        if (resolver && resolver.canResolve(resolverRef, registry.config) && 
            (!context || this.canResolveInContext(resolver, context))) {
          return { resolver, registry };
        }
      }
    }

    // Then check if the reference is a direct resolver name (e.g., @TIME, @DEBUG)
    // This is for built-in resolvers that don't need registry configuration
    const resolverName = ref.replace(/^@/, '').split('/')[0];
    const directResolver = this.resolvers.get(resolverName) || 
                          this.resolvers.get(resolverName.toUpperCase()) ||
                          this.resolvers.get(resolverName.toLowerCase());
    
    if (directResolver && directResolver.canResolve(ref) && 
        (!context || this.canResolveInContext(directResolver, context))) {
      return { resolver: directResolver };
    }

    // Fallback: Check resolvers by priority
    const contextResolvers = context ? 
      this.getResolversForContext(context) : 
      this.resolversByPriority;
    
    for (const resolver of contextResolvers) {
      if (resolver.canResolve(ref)) {
        return { resolver };
      }
    }

    return {};
  }

  /**
   * Validate a registry configuration
   */
  private validateRegistry(registry: RegistryConfig): void {
    if (!registry.prefix || !registry.resolver) {
      throw new Error('Registry must have prefix and resolver specified');
    }

    // Check if resolver exists or is a custom path
    if (!registry.resolver.includes('/') && !this.resolvers.has(registry.resolver)) {
      throw new Error(`Unknown resolver: ${registry.resolver}`);
    }

    // Validate custom resolver paths
    if (registry.resolver.includes('/') && !this.securityPolicy.allowCustom) {
      throw new Error('Custom resolvers are not allowed by security policy');
    }

    // Validate resolver config if validator exists
    const resolver = this.resolvers.get(registry.resolver);
    if (resolver?.validateConfig) {
      const errors = resolver.validateConfig(registry.config);
      if (errors.length > 0) {
        throw new Error(`Invalid config for ${registry.resolver}: ${errors.join(', ')}`);
      }
    }
  }

  /**
   * Apply timeout to a promise
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }
}