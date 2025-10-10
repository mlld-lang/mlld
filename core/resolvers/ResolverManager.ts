import { 
  Resolver, 
  ResolverContent, 
  ResolutionResult, 
  PrefixConfig, 
  ResolverSecurityPolicy,
  ResolverOptions,
  ContentInfo,
  ResolutionContext
} from '@core/resolvers/types';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MlldResolutionError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { ModuleCache, LockFile, type ModuleCacheStoreOptions } from '@core/registry';
import { HashUtils } from '@core/registry/utils/HashUtils';
import { parseModuleMetadata, formatDependencyMap } from '@core/registry/utils/ModuleMetadata';
import { hasUncommittedChanges, getGitStatus } from '@core/utils/gitStatus';

/**
 * Information about a local module for dev mode
 */
interface LocalModuleInfo {
  name: string;
  author: string;
  path: string;
}

/**
 * Manages resolver registration, routing, and execution
 */
export class ResolverManager {
  private resolvers: Map<string, Resolver> = new Map();
  private resolversByPriority: Resolver[] = [];
  private resolverNamesCache: Set<string> = new Set(); // Cache all resolver name variants
  private prefixConfigs: PrefixConfig[] = [];
  private securityPolicy: ResolverSecurityPolicy;
  private moduleCache?: ModuleCache;
  private lockFile?: LockFile;
  private offlineMode: boolean = false;
  private localModulePrefixes: Map<string, PrefixConfig> = new Map(); // Local module prefixes discovered on disk
  private localModulesByAuthor: Map<string, string[]> = new Map(); // Track modules by author for local modules

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
  setDevMode(_devMode: boolean): void {
    logger.debug('setDevMode is deprecated. Local modules are managed automatically.');
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
   * Configure prefixes from lock file or config
   */
  configurePrefixes(prefixes: PrefixConfig[], projectRoot?: string): void {
    const usablePrefixes = prefixes.filter(prefixConfig => {
      if (prefixConfig.resolver === 'LOCAL' && !prefixConfig.config?.basePath) {
        logger.debug(`Skipping LOCAL prefix ${prefixConfig.prefix} without basePath (managed via llm/modules discovery)`);
        return false;
      }
      return true;
    });

    // Validate all prefixes first
    for (const prefix of usablePrefixes) {
      this.validatePrefixConfig(prefix);
    }

    // If projectRoot is provided, resolve relative basePaths in prefix configs
    const processedPrefixes = projectRoot ? usablePrefixes.map(prefixConfig => {
      if (prefixConfig.config?.basePath && !path.isAbsolute(prefixConfig.config.basePath)) {
        // Resolve relative basePath relative to project root
        const resolvedPath = path.resolve(projectRoot, prefixConfig.config.basePath);
        return {
          ...prefixConfig,
          config: {
            ...prefixConfig.config,
            basePath: resolvedPath
          }
        };
      }
      return prefixConfig;
    }) : usablePrefixes;

    // Sort by prefix length (longest first) for proper matching
    this.prefixConfigs = processedPrefixes.sort((a, b) => b.prefix.length - a.prefix.length);
    logger.debug(`Configured ${processedPrefixes.length} prefixes`);
  }

  /**
   * Discover local modules and configure prefixes for authors with access
   */
  async configureLocalModules(localModulePath: string, options: { currentUser?: string; allowedAuthors?: Iterable<string> } = {}): Promise<void> {
    try {
      const modules = await this.scanLocalModules(localModulePath);
      const authorModules = this.groupModulesByAuthor(modules);
      const allowedAuthorSet = new Set<string>(options.allowedAuthors ? Array.from(options.allowedAuthors, a => a.toLowerCase()) : []);
      const currentUser = options.currentUser?.toLowerCase();

      this.localModulePrefixes.clear();
      this.localModulesByAuthor.clear();

      for (const [author, moduleNames] of authorModules) {
        const normalizedAuthor = author.toLowerCase();
        const isAllowed = normalizedAuthor === currentUser || allowedAuthorSet.has(normalizedAuthor);
        if (!isAllowed) {
          logger.debug(`Skipping local modules for @${author} (no access)`);
          continue;
        }

        this.localModulesByAuthor.set(author, moduleNames);
        const prefix: PrefixConfig = {
          prefix: `@${author}/`,
          resolver: 'LOCAL',
          type: 'input',
          priority: 5,
          config: {
            basePath: localModulePath,
            moduleFilter: (name: string) => moduleNames.includes(this.stripModuleExtension(name))
          }
        };

        this.localModulePrefixes.set(prefix.prefix, prefix);
        logger.debug(`Local modules: Added prefix ${prefix.prefix} for modules: ${moduleNames.join(', ')}`);
      }

      if (this.localModulePrefixes.size === 0) {
        logger.debug('No local module prefixes configured');
      }
    } catch (error) {
      logger.warn('Failed to configure local modules:', error);
    }
  }

  /**
   * Scan local modules directory
   */
  private async scanLocalModules(basePath: string): Promise<LocalModuleInfo[]> {
    const modules: LocalModuleInfo[] = [];

    try {
      const files = await fs.readdir(basePath);

      for (const file of files) {
        // Check for all valid mlld extensions
        if (file.endsWith('.mlld.md') || file.endsWith('.mld.md') ||
            file.endsWith('.mld') || file.endsWith('.md')) {
          try {
            const filePath = path.join(basePath, file);
            const content = await fs.readFile(filePath, 'utf8');
            const metadata = this.extractMetadata(content);

            if (metadata?.name && metadata?.author) {
              modules.push({
                name: metadata.name,
                author: metadata.author,
                path: filePath
              });
            }
          } catch (error) {
            logger.debug(`Failed to read module ${file}:`, error);
          }
        }
      }
    } catch (error) {
      logger.debug(`Failed to scan directory ${basePath}:`, error);
    }

    return modules;
  }

  /**
   * Extract metadata from module frontmatter
   */
  private extractMetadata(content: string): Record<string, any> | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;
    
    const frontmatter = frontmatterMatch[1];
    const metadata: Record<string, any> = {};
    
    // Simple YAML parsing for basic key-value pairs
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        // Remove quotes if present
        metadata[key] = value.replace(/^["']|["']$/g, '');
      }
    }
    
    return metadata;
  }

  /**
   * Group modules by author
   */
  private groupModulesByAuthor(modules: LocalModuleInfo[]): Map<string, string[]> {
    const authorModules = new Map<string, string[]>();
    
    for (const module of modules) {
      if (!authorModules.has(module.author)) {
        authorModules.set(module.author, []);
      }
      authorModules.get(module.author)!.push(module.name);
    }
    
    return authorModules;
  }

  /**
   * Get local module prefixes for debugging
   */
  getLocalPrefixes(): Array<[string, string[]]> {
    return Array.from(this.localModulesByAuthor.entries());
  }

  hasLocalModule(reference: string): boolean {
    const normalized = this.normalizeModuleReference(reference);
    const [authorWithPrefix, moduleName] = normalized.split('/');
    const author = authorWithPrefix.replace(/^@/, '');
    const modules = this.localModulesByAuthor.get(author);
    return modules ? modules.includes(moduleName) : false;
  }

  private normalizeModuleReference(ref: string): string {
    const cleaned = ref.replace(/^@/, '');
    const [author, rawModule = ''] = cleaned.split('/');
    const module = this.stripModuleExtension(rawModule);
    return `@${author}/${module}`;
  }

  private stripModuleExtension(module: string): string {
    const extensions = ['.mlld.md', '.mld.md', '.mlld', '.mld', '.md'];
    for (const ext of extensions) {
      if (module.endsWith(ext)) {
        return module.slice(0, -ext.length);
      }
    }
    return module;
  }

  private findLocalPrefix(ref: string): PrefixConfig | undefined {
    for (const [prefix, config] of this.localModulePrefixes) {
      if (ref.startsWith(prefix)) {
        const moduleRef = ref.slice(prefix.length);
        if (!config.config?.moduleFilter || config.config.moduleFilter(moduleRef)) {
          return config;
        }
      }
    }
    return undefined;
  }

  /**
   * Resolve a module reference
   */
  async resolve(ref: string, options?: ResolverOptions): Promise<ResolutionResult> {
    const startTime = Date.now();

    // 1. Check if we have a hash for this module in lock file (skip for local files)
    const isLocal = ref.startsWith('@local/') || ref.startsWith('local://');
    if (this.lockFile && this.moduleCache && !isLocal) {
      // Convert reference to module name format
      const moduleName = this.refToModuleName(ref);
      const lockEntry = this.lockFile.getModule(moduleName);
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
                  contentType: cached.contentType || 'module', // Default to module if not stored
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
              await this.lockFile.removeModule(moduleName);
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

    // 2. Find matching prefix by prefix
    const { resolver, prefixConfig } = await this.findResolver(ref, options?.context);

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
    if (prefixConfig?.prefix && ref.startsWith(prefixConfig.prefix)) {
      resolverRef = ref.slice(prefixConfig.prefix.length);
    }

    // Check access if supported
    if (resolver.checkAccess) {
      const hasAccess = await resolver.checkAccess(resolverRef, 'read', prefixConfig?.config);
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
      
      // Merge prefix config with options
      const resolverConfig = {
        ...prefixConfig?.config,
        context: options?.context,
        prefix: prefixConfig?.prefix
      };
      
      const content = await this.withTimeout(
        resolver.resolve(resolverRef, resolverConfig),
        timeoutMs || 30000
      );

      // 4. Cache the content if cache is available (but skip local files)
      if (this.moduleCache && content.content && resolver.name !== 'LOCAL') {
        try {
          const storeOptions = this.buildModuleCacheOptions(content);
          const cacheEntry = await this.moduleCache.store(
            content.content,
            content.metadata?.source || ref,
            ref,
            storeOptions
          );
          
          // Add hash to metadata
          content.metadata = {
            ...content.metadata,
            hash: cacheEntry.hash
          };
          
          // 5. Update lock file with new hash
          if (this.lockFile) {
            const moduleName = this.refToModuleName(ref);
            await this.lockFile.addModule(moduleName, {
              version: 'latest', // TODO: Get actual version from resolver
              resolved: cacheEntry.hash,
              source: content.metadata.source || ref,
              integrity: `sha256:${cacheEntry.hash}`,
              fetchedAt: new Date().toISOString()
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
      if (resolver.name !== 'LOCAL' && prefixConfig?.config?.basePath) {
        // Add .mlld.md extension if not present
        let fileName = resolverRef;
        if (!fileName.includes('.')) {
          fileName += '.mlld.md';
        }
        const localPath = path.join(process.cwd(), prefixConfig.config.basePath, fileName);
        
        // Check if local file exists and has uncommitted changes
        const gitStatus = await getGitStatus(localPath);
        if (gitStatus === 'modified' || gitStatus === 'untracked') {
          const statusEmoji = gitStatus === 'modified' ? '📝' : '🆕';
          const statusText = gitStatus === 'modified' ? 'modified' : 'untracked';
          
          logger.warn(`${statusEmoji} Local ${statusText} version detected for ${prefixConfig.prefix}${resolverRef}`);
          logger.warn(`   Remote: Using ${resolver.name} resolver`);
          logger.warn(`   Local:  ${localPath}`);
          logger.warn(`   Hint:   Use '/import local' to load from llm/modules`);
          logger.warn(`           Local path: ${localPath}`);
        }
      }

      return {
        content,
        resolverName: resolver.name,
        matchedPrefix: prefixConfig?.prefix,
        resolutionTime
      };
    } catch (error) {
      if (error instanceof MlldResolutionError) {
        const localPrefixConfig = this.findLocalPrefix(ref);
        if (localPrefixConfig) {
          const localResolver = this.resolvers.get(localPrefixConfig.resolver);
          if (localResolver) {
            const moduleRef = ref.slice(localPrefixConfig.prefix.length);
            try {
              const localContent = await localResolver.resolve(moduleRef, {
                basePath: localPrefixConfig.config?.basePath || process.cwd()
              });
              const resolutionTime = Date.now() - startTime;

              return {
                content: localContent,
                resolverName: 'LOCAL',
                matchedPrefix: localPrefixConfig.prefix,
                resolutionTime
              };
            } catch (localError) {
              logger.debug(`Local fallback failed: ${(localError as Error).message}`);
            }
          }
        }
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

    const { resolver, prefixConfig } = await this.findResolver(ref, undefined);

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
    if (prefixConfig?.prefix && ref.startsWith(prefixConfig.prefix)) {
      resolverRef = ref.slice(prefixConfig.prefix.length);
    }

    // Check access if supported
    if (resolver.checkAccess) {
      const hasAccess = await resolver.checkAccess(resolverRef, 'write', prefixConfig?.config);
      if (!hasAccess) {
        throw new MlldResolutionError(
          `Write access denied for reference: ${ref}`,
          { reference: ref, resolverName: resolver.name }
        );
      }
    }

    try {
      await resolver.write(resolverRef, content, prefixConfig?.config);
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
    const { resolver, prefixConfig } = await this.findResolver(prefix, undefined);

    if (!resolver || !resolver.list) {
      return [];
    }

    // Strip prefix from reference for resolver operations
    let resolverPrefix = prefix;
    if (prefixConfig?.prefix && prefix.startsWith(prefixConfig.prefix)) {
      resolverPrefix = prefix.slice(prefixConfig.prefix.length);
    }

    try {
      return await resolver.list(resolverPrefix, prefixConfig?.config);
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
   * Get configured prefixes
   */
  getPrefixConfigs(): PrefixConfig[] {
    return [...this.prefixConfigs];
  }
  
  /**
   * Update prefix configuration after initialization
   * Useful for updating basePath after project root discovery
   */
  updatePrefixConfig(prefix: string, updates: Partial<any>): void {
    const prefixConfig = this.prefixConfigs.find(r => r.prefix === prefix);
    if (prefixConfig) {
      prefixConfig.config = { ...prefixConfig.config, ...updates };
      logger.debug(`Updated prefix config for ${prefix}:`, updates);
    }
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
  private async findResolver(ref: string, context?: ResolutionContext): Promise<{ resolver?: Resolver, prefixConfig?: PrefixConfig }> {
    // Check local module prefixes first
    if (this.localModulePrefixes.size > 0) {
      for (const [prefix, config] of this.localModulePrefixes) {
        if (ref.startsWith(prefix)) {
          const resolver = this.resolvers.get(config.resolver);
          if (resolver) {
            const moduleRef = ref.slice(prefix.length);
            if (config.config?.moduleFilter?.(moduleRef)) {
              logger.debug(`Local modules: Resolved ${ref} to local module`);
              return { resolver, prefixConfig: config };
            }
          }
        }
      }
    }
    
    // First, check configured prefixes (sorted by prefix length)
    // This ensures that explicit prefix configurations take precedence
    for (const prefixConfig of this.prefixConfigs) {
      if (ref.startsWith(prefixConfig.prefix)) {
        const resolver = this.resolvers.get(prefixConfig.resolver);
        if (!resolver) {
          const availableResolvers = Array.from(this.resolvers.keys());
          throw new MlldResolutionError(
            `Resolver '${prefixConfig.resolver}' not found. ` +
            `Prefix '${prefixConfig.prefix}' is configured to use '${prefixConfig.resolver}' resolver, ` +
            `but only these resolvers are registered: ${availableResolvers.join(', ')}`,
            { 
              prefix: prefixConfig.prefix,
              expectedResolver: prefixConfig.resolver,
              availableResolvers 
            }
          );
        }
        // Strip prefix from reference before checking canResolve
        const resolverRef = ref.slice(prefixConfig.prefix.length);
        if (resolver.canResolve(resolverRef, prefixConfig.config) && 
            (!context || this.canResolveInContext(resolver, context))) {
          return { resolver, prefixConfig };
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
   * Validate a prefix configuration
   */
  private validatePrefixConfig(prefixConfig: PrefixConfig): void {
    if (!prefixConfig.prefix || !prefixConfig.resolver) {
      throw new Error('Prefix configuration must have prefix and resolver specified');
    }

    // Check if resolver exists or is a custom path
    if (!prefixConfig.resolver.includes('/') && !this.resolvers.has(prefixConfig.resolver)) {
      throw new Error(`Unknown resolver: ${prefixConfig.resolver}`);
    }

    // Validate custom resolver paths
    if (prefixConfig.resolver.includes('/') && !this.securityPolicy.allowCustom) {
      throw new Error('Custom resolvers are not allowed by security policy');
    }

    // Validate resolver config if validator exists
    const resolver = this.resolvers.get(prefixConfig.resolver);
    if (resolver?.validateConfig) {
      const errors = resolver.validateConfig(prefixConfig.config);
      if (errors.length > 0) {
        throw new Error(`Invalid config for ${prefixConfig.resolver}: ${errors.join(', ')}`);
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

  /**
   * Convert a reference to a module name format
   * @param ref Reference like @author/module, mlld://author/module, etc.
   * @returns Module name in @author/module format
   */
  private buildModuleCacheOptions(content: ResolverContent): ModuleCacheStoreOptions | undefined {
    if (content.contentType !== 'module') {
      return undefined;
    }

    try {
      const parsed = parseModuleMetadata(content.content);
      return {
        dependencies: formatDependencyMap(parsed.dependencies),
        devDependencies: formatDependencyMap(parsed.devDependencies),
        moduleNeeds: parsed.needs
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug(`Failed to parse module metadata for cache: ${message}`);
      return undefined;
    }
  }

  private refToModuleName(ref: string): string {
    // Remove mlld:// prefix if present
    if (ref.startsWith('mlld://')) {
      return ref.replace('mlld://', '@');
    }
    // Already in @author/module format
    if (ref.startsWith('@')) {
      return ref;
    }
    // Assume it's author/module format
    return `@${ref}`;
  }
}