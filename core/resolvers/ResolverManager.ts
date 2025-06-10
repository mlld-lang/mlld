import { 
  Resolver, 
  ResolverContent, 
  ResolutionResult, 
  RegistryConfig, 
  ResolverSecurityPolicy,
  ResolverOptions,
  ContentInfo
} from '@core/resolvers/types';
import { MlldResolutionError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { ModuleCache, LockFile } from '@core/registry';
import { HashUtils } from '@core/registry/utils/HashUtils';

/**
 * Manages resolver registration, routing, and execution
 */
export class ResolverManager {
  private resolvers: Map<string, Resolver> = new Map();
  private registries: RegistryConfig[] = [];
  private securityPolicy: ResolverSecurityPolicy;
  private moduleCache?: ModuleCache;
  private lockFile?: LockFile;
  private offlineMode: boolean = false;

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
    logger.debug(`Registered resolver: ${resolver.name}`);
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
    const { resolver, registry } = await this.findResolver(ref);

    if (!resolver) {
      throw new MlldResolutionError(
        `No resolver found for reference: ${ref}`,
        { reference: ref }
      );
    }

    // Check if resolver supports input operations
    if (resolver.type === 'output') {
      throw new MlldResolutionError(
        `Resolver '${resolver.name}' does not support input operations`,
        { reference: ref, resolverName: resolver.name }
      );
    }

    // Check access if supported
    if (resolver.checkAccess) {
      const hasAccess = await resolver.checkAccess(ref, 'read', registry?.config);
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
      const content = await this.withTimeout(
        resolver.resolve(ref, registry?.config),
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
          if (this.lockFile && process.env.MLLD_TEST_MODE !== 'true') {
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

      return {
        content,
        resolverName: resolver.name,
        matchedPrefix: registry?.prefix,
        resolutionTime
      };
    } catch (error) {
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

    const { resolver, registry } = await this.findResolver(ref);

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

    // Check access if supported
    if (resolver.checkAccess) {
      const hasAccess = await resolver.checkAccess(ref, 'write', registry?.config);
      if (!hasAccess) {
        throw new MlldResolutionError(
          `Write access denied for reference: ${ref}`,
          { reference: ref, resolverName: resolver.name }
        );
      }
    }

    try {
      await resolver.write(ref, content, registry?.config);
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
    const { resolver, registry } = await this.findResolver(prefix);

    if (!resolver || !resolver.list) {
      return [];
    }

    try {
      return await resolver.list(prefix, registry?.config);
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
   * Get configured registries
   */
  getRegistries(): RegistryConfig[] {
    return [...this.registries];
  }

  /**
   * Find the appropriate resolver for a reference
   */
  private async findResolver(ref: string): Promise<{ resolver?: Resolver, registry?: RegistryConfig }> {
    // Check configured registries first (sorted by prefix length)
    for (const registry of this.registries) {
      if (ref.startsWith(registry.prefix)) {
        const resolver = this.resolvers.get(registry.resolver);
        if (resolver && resolver.canResolve(ref, registry.config)) {
          return { resolver, registry };
        }
      }
    }

    // Fallback: Check if any resolver can handle it directly
    // This allows resolvers to handle patterns like @user/module
    for (const [name, resolver] of this.resolvers) {
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