import type { MlldNode, SourceLocation, DirectiveNode } from '@core/types';
import type { Variable, VariableSource, PipelineInput, VariableMetadata } from '@core/types/variable';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import type { ResolvedURLConfig } from '@core/config/types';
import type { FuzzyMatchConfig } from '@core/resolvers/types';
import * as path from 'path';
import type { ImportType } from '@core/types/security';
import { ImportApproval } from '@core/security/ImportApproval';
import { ImmutableCache } from '@core/security/ImmutableCache';
import { GistTransformer } from '@core/security/GistTransformer';
import { SecurityManager } from '@security';
import { RegistryManager, ModuleCache, LockFile } from '@core/registry';
import { 
  ResolverManager, 
  RegistryResolver,
  LocalResolver, 
  GitHubResolver, 
  HTTPResolver,
  ProjectPathResolver
} from '@core/resolvers';
import { PathMatcher } from '@core/resolvers/utils/PathMatcher';
import { logger } from '@core/utils/logger';
import type { CacheManager } from './CacheManager';
import type { PathContext } from '@core/services/PathContextService';

/**
 * Dependencies needed by ImportResolver from the Environment
 */
export interface ImportResolverDependencies {
  fileSystem: IFileSystemService;
  pathService: IPathService;
  pathContext: PathContext; // Path context for all path operations
  cacheManager: CacheManager;
  getSecurityManager: () => SecurityManager | undefined;
  getRegistryManager: () => RegistryManager | undefined;
  getResolverManager: () => ResolverManager | undefined;
  getParent: () => ImportResolverContext | undefined;
  getCurrentFilePath: () => string | undefined;
  getApproveAllImports: () => boolean;
  getLocalFileFuzzyMatch: () => FuzzyMatchConfig | boolean;
  getURLConfig: () => ResolvedURLConfig | undefined;
  getDefaultUrlOptions: () => {
    allowedProtocols: string[];
    allowedDomains: string[];
    blockedDomains: string[];
    maxResponseSize: number;
    timeout: number;
  };
  getAllowAbsolutePaths: () => boolean;
}


export interface FetchURLOptions {
  forImport?: boolean;
  importType?: ImportType;
  cacheDurationMs?: number;
}

/**
 * Context interface for parent environments in the import resolution chain
 */
export interface ImportResolverContext {
  isImporting(path: string): boolean;
  getImportApproval(): ImportApproval | undefined;
  getImmutableCache(): ImmutableCache | undefined;
}

/**
 * Interface for the ImportResolver
 */
export interface IImportResolver {
  // Module resolution
  resolveModule(reference: string, context?: 'import' | 'path' | 'variable'): Promise<{ 
    content: string; 
    contentType: 'module' | 'data' | 'text'; 
    metadata?: any;
    mx?: any;
    resolverName?: string;
  }>;
  
  // File and URL operations
  readFile(pathOrUrl: string): Promise<string>;
  resolvePath(inputPath: string): Promise<string>;
  getProjectPath(): Promise<string>;
  
  // URL operations
  isURL(path: string): boolean;
  areURLsEnabled(): boolean;
  validateURL(url: string): Promise<void>;
  fetchURL(url: string, options?: FetchURLOptions): Promise<string>;
  fetchURLWithMetadata(url: string): Promise<{
    content: string;
    headers: Record<string, string>;
    status: number;
  }>;
  
  // Import tracking
  isImporting(path: string): boolean;
  beginImport(path: string): void;
  endImport(path: string): void;
  
  // Child creation
  createChildResolver(newBasePath?: string, getAllowAbsolutePaths?: () => boolean): IImportResolver;
}

/**
 * ImportResolver handles all import, resolution, and URL operations for Environment
 */
export class ImportResolver implements IImportResolver, ImportResolverContext {
  private importStack: Set<string> = new Set();
  private pathMatcher?: PathMatcher;
  private importApproval?: ImportApproval;
  private immutableCache?: ImmutableCache;
  
  constructor(private dependencies: ImportResolverDependencies) {
    // Initialize PathMatcher for fuzzy file matching
    this.pathMatcher = new PathMatcher(dependencies.fileSystem);
    
    // Initialize security components for root environment only
    if (!dependencies.getParent()) {
      try {
        const projectRoot = dependencies.pathContext.projectRoot;
        this.importApproval = new ImportApproval(projectRoot);
        this.immutableCache = new ImmutableCache(projectRoot);
      } catch (error) {
        console.warn('Failed to initialize import approval/cache:', error);
      }
    }
  }
  
  // --- Module Resolution ---
  
  /**
   * Resolve a module reference using the ResolverManager
   * This handles @prefix/ patterns and registry lookups for @user/module
   */
  async resolveModule(reference: string, context?: 'import' | 'path' | 'variable'): Promise<{ content: string; contentType: 'module' | 'data' | 'text'; metadata?: any; mx?: any; resolverName?: string }> {
    const resolverManager = this.dependencies.getResolverManager();
    if (!resolverManager) {
      throw new Error('ResolverManager not available');
    }
    
    const result = await resolverManager.resolve(reference, { context });
    
    // Check if result.content exists
    if (!result || !result.content) {
      throw new Error(`Resolver returned invalid result for '${reference}': missing content`);
    }
    
    // Check the structure of result.content
    if (!result.content.content || !result.content.contentType) {
      throw new Error(`Resolver returned invalid content structure for '${reference}': missing content or contentType`);
    }
    
    // The result.content is already the resolver's result object
    return {
      content: result.content.content,
      contentType: result.content.contentType,
      metadata: result.content.metadata,
      mx: result.content.mx,
      resolverName: result.resolverName
    };
  }
  
  // --- File and URL Operations ---
  
  async readFile(pathOrUrl: string): Promise<string> {
    if (this.isURL(pathOrUrl)) {
      return this.fetchURL(pathOrUrl);
    }
    const resolvedPath = await this.resolvePath(pathOrUrl);
    const content = await this.dependencies.fileSystem.readFile(resolvedPath);
    return content;
  }
  
  async resolvePath(inputPath: string): Promise<string> {
    const originalInputPath = inputPath;

    // Handle special path variables
    if (inputPath.startsWith('@PROJECTPATH')) {
      inputPath = inputPath.replace('@PROJECTPATH', await this.getProjectPath());
    }
    if (inputPath.startsWith('@base/') || inputPath.startsWith('@root/')) {
      const projectRoot = await this.getProjectPath();
      const prefixLen = inputPath.startsWith('@base/') ? 6 : 6;
      inputPath = path.join(projectRoot, inputPath.substring(prefixLen));
    }
    
    // Handle URL-relative resolution when current file is a URL
    const currentFile = this.dependencies.getCurrentFilePath?.();
    if (currentFile && this.isURL(currentFile) && !this.isURL(inputPath) && !path.isAbsolute(inputPath)) {
      try {
        // Resolve relative path against current URL
        const resolvedURL = new URL(inputPath, currentFile);
        return resolvedURL.toString();
      } catch (error) {
        // If URL resolution fails, fall back to file-based resolution
        console.warn(`Failed to resolve relative URL ${inputPath} against ${currentFile}:`, error);
      }
    }

    // Check if fuzzy matching is enabled for local files
    const localFileFuzzyMatch = this.dependencies.getLocalFileFuzzyMatch();
    const fuzzyEnabled = typeof localFileFuzzyMatch === 'boolean'
      ? localFileFuzzyMatch
      : localFileFuzzyMatch.enabled !== false;
    const collectedSuggestions: string[] = [];

    if (!path.isAbsolute(inputPath) && fuzzyEnabled && this.pathMatcher) {
      // Try fuzzy matching for local files
      const matchResult = await this.pathMatcher.findMatch(
        inputPath,
        this.dependencies.pathContext.fileDirectory,
        typeof localFileFuzzyMatch === 'object' ? localFileFuzzyMatch : undefined
      );
      
      if (matchResult.path) {
        return matchResult.path;
      }

      if (matchResult.suggestions?.length) {
        collectedSuggestions.push(...matchResult.suggestions);
      }

      // If no match found with fuzzy matching, check with extensions
      if (!path.extname(inputPath)) {
        const extensions = ['.mld.md', '.mld', '.md', '.mlld.md'];

        for (const ext of extensions) {
          const pathWithExt = inputPath + ext;
          const extMatchResult = await this.pathMatcher.findMatch(
            pathWithExt,
            this.dependencies.pathContext.fileDirectory,
            typeof localFileFuzzyMatch === 'object' ? localFileFuzzyMatch : undefined
          );
          
          if (extMatchResult.path) {
            return extMatchResult.path;
          }

          // Collect suggestions from each extension attempt
          if (extMatchResult.suggestions) {
            collectedSuggestions.push(...extMatchResult.suggestions);
          }
        }
      }

      // If we have candidates (ambiguous matches), throw error
      if (matchResult.candidates && matchResult.candidates.length > 1) {
        const candidates = matchResult.candidates
          .map(c => `  - ${c.path} (${c.matchType} match, confidence: ${c.confidence})`)
          .join('\n');
        throw new Error(`Ambiguous file match for: ${inputPath}\n\nMultiple files match:\n${candidates}`);
      }
    }

    // Fall back to standard path resolution
    const resolvedPath = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(this.dependencies.pathContext.fileDirectory, inputPath);

    if (!await this.dependencies.fileSystem.exists(resolvedPath)) {
      throw await this.createFileNotFoundError(originalInputPath, collectedSuggestions);
    }

    return resolvedPath;
  }

  private async createFileNotFoundError(inputPath: string, suggestions: string[] = []): Promise<Error> {
    const didYouMean = await this.buildPathSuggestions(inputPath, suggestions);
    const lines = [`File not found: ${inputPath}`];

    if (didYouMean.length > 0) {
      lines.push('', 'Did you mean:', ...didYouMean.map(suggestion => `  - ${suggestion}`));
    }

    lines.push(
      '',
      'Paths resolve relative to the current mlld file directory. Use @base/... to resolve from the project root.'
    );

    return new Error(lines.join('\n'));
  }

  private async buildPathSuggestions(inputPath: string, suggestions: string[]): Promise<string[]> {
    const unique = new Set<string>();

    for (const suggestion of suggestions) {
      const normalized = suggestion.replace(/^\s*-\s*/, '').trim();
      if (normalized.length > 0) {
        unique.add(normalized);
      }
    }

    const commonSuggestions = await this.collectCommonLocationSuggestions(inputPath);
    for (const suggestion of commonSuggestions) {
      unique.add(suggestion);
    }

    return Array.from(unique).slice(0, 3);
  }

  private async collectCommonLocationSuggestions(inputPath: string): Promise<string[]> {
    if (this.isURL(inputPath) || path.isAbsolute(inputPath) || inputPath.includes('..')) {
      return [];
    }

    const isBasePath = inputPath.startsWith('@base/') || inputPath.startsWith('@root/');
    const isDotRelative = inputPath.startsWith('./');
    const isExplicitRelative = isDotRelative || inputPath.startsWith('../');
    const normalizedPath = isBasePath
      ? inputPath.replace(/^@(base|root)\//, '')
      : inputPath.replace(/^\.\//, '');

    if (normalizedPath.length === 0) {
      return [];
    }

    const projectRoot = await this.getProjectPath();
    const fileDirectory = this.dependencies.pathContext.fileDirectory;

    const relativeSuggestion = `./${normalizedPath}`;
    const baseSuggestion = `@base/${normalizedPath}`;
    const relativeExists = await this.dependencies.fileSystem.exists(path.resolve(fileDirectory, normalizedPath));
    const baseExists = await this.dependencies.fileSystem.exists(path.join(projectRoot, normalizedPath));

    if (!isBasePath && !isExplicitRelative) {
      const suggestions: string[] = [];

      if (relativeExists) {
        suggestions.push(relativeSuggestion);
      }
      if (baseExists) {
        suggestions.push(baseSuggestion);
      }

      if (suggestions.length === 0) {
        suggestions.push(relativeSuggestion, baseSuggestion);
      }

      return suggestions;
    }

    if (isDotRelative) {
      return [baseSuggestion];
    }

    if (isBasePath) {
      return [relativeSuggestion];
    }

    return [];
  }

  async getProjectPath(): Promise<string> {
    // Use project root from PathContext
    return this.dependencies.pathContext.projectRoot;
  }
  
  // --- URL Operations ---
  
  isURL(path: string): boolean {
    try {
      const url = new URL(path);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }
  
  areURLsEnabled(): boolean {
    const urlConfig = this.dependencies.getURLConfig();
    return urlConfig?.enabled || false;
  }
  
  async validateURL(url: string): Promise<void> {
    const parsed = new URL(url);
    const urlConfig = this.dependencies.getURLConfig();
    const defaultOptions = this.dependencies.getDefaultUrlOptions();
    const config = urlConfig || defaultOptions;
    
    // Check if URLs are enabled
    if (urlConfig && !urlConfig.enabled) {
      throw new Error('URL support is not enabled in configuration');
    }
    
    // Check protocol
    const allowedProtocols = urlConfig?.allowedProtocols || config.allowedProtocols;
    if (!allowedProtocols.includes(parsed.protocol.slice(0, -1))) {
      throw new Error(`Protocol not allowed: ${parsed.protocol}`);
    }
    
    // Warn on insecure protocol if configured
    if (urlConfig?.warnOnInsecureProtocol && parsed.protocol === 'http:') {
      console.warn(`Warning: Using insecure HTTP protocol for ${url}`);
    }
    
    // Check domain allowlist if configured
    const allowedDomains = urlConfig?.allowedDomains || config.allowedDomains;
    if (allowedDomains.length > 0) {
      const allowed = allowedDomains.some(
        domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      );
      if (!allowed) {
        throw new Error(`Domain not allowed: ${parsed.hostname}`);
      }
    }
    
    // Check domain blocklist
    const blockedDomains = urlConfig?.blockedDomains || config.blockedDomains;
    const blocked = blockedDomains.some(
      domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
    if (blocked) {
      throw new Error(`Domain blocked: ${parsed.hostname}`);
    }
  }
  
  async fetchURL(url: string, options: FetchURLOptions = {}): Promise<string> {
    const { forImport = false, importType, cacheDurationMs } = options;
    const effectiveImportType: ImportType | undefined = importType ?? (forImport ? 'static' : undefined);
    const isImport = Boolean(effectiveImportType);

    // Transform Gist URLs to raw URLs
    if (GistTransformer.isGistUrl(url)) {
      url = await GistTransformer.transformToRaw(url);
    }

    const urlConfig = this.dependencies.getURLConfig();
    const cacheEnabled = urlConfig?.cache.enabled ?? true;

    if (isImport && effectiveImportType === 'cached' && cacheEnabled) {
      const cached = this.dependencies.cacheManager.getURLCacheEntry(url);
      if (cached) {
        const ttl = cacheDurationMs ?? cached.ttl ?? this.getURLCacheTTL(url);
        if (Date.now() - cached.timestamp < ttl) {
          return cached.content;
        }
      }
    } else if (isImport && effectiveImportType !== 'live' && this.getImmutableCache()) {
      const cached = await this.getImmutableCache()!.get(url);
      if (cached) {
        return cached;
      }
    } else if (!isImport && cacheEnabled) {
      const cached = this.dependencies.cacheManager.getURLCacheEntry(url);
      if (cached && this.dependencies.cacheManager.isURLCacheEntryValid(url)) {
        return cached.content;
      }
    }

    // Validate URL
    await this.validateURL(url);

    // Get timeout and max size from config
    const defaultOptions = this.dependencies.getDefaultUrlOptions();
    const timeout = urlConfig?.timeout || defaultOptions.timeout;
    const maxSize = urlConfig?.maxSize || defaultOptions.maxResponseSize;

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Test hook: allow override of fetch for unit tests
      const override = (globalThis as any).__mlldFetchOverride as (u: string) => Promise<any> | undefined;
      const response = override ? await override(url) : await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      // Check content size
      const content = await response.text();
      if (content.length > maxSize) {
        throw new Error(`Response too large: ${content.length} bytes`);
      }

      const approveAllImports = this.dependencies.getApproveAllImports();
      if (isImport && this.getImportApproval() && !approveAllImports) {
        const approved = await this.getImportApproval()!.checkApproval(url, content);
        if (!approved) {
          throw new Error('Import not approved by user');
        }
        if (effectiveImportType !== 'cached' && effectiveImportType !== 'live' && this.getImmutableCache()) {
          await this.getImmutableCache()!.set(url, content);
        }
      } else if (isImport && approveAllImports && effectiveImportType !== 'cached' && effectiveImportType !== 'live' && this.getImmutableCache()) {
        await this.getImmutableCache()!.set(url, content);
      }

      if (isImport) {
        if (effectiveImportType === 'cached' && cacheEnabled) {
          const ttl = cacheDurationMs ?? this.getURLCacheTTL(url);
          this.dependencies.cacheManager.setURLCacheEntry(url, content, ttl);
        }
      } else if (cacheEnabled) {
        const ttl = this.getURLCacheTTL(url);
        this.dependencies.cacheManager.setURLCacheEntry(url, content, ttl);
      }

      return content;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`);
      }
      throw error;
    }
  }
  
  private getURLCacheTTL(url: string): number {
    return this.dependencies.cacheManager.getURLCacheTTL(url);
  }
  
  /**
   * Fetch URL with full response metadata for content loading
   */
  async fetchURLWithMetadata(url: string): Promise<{
    content: string;
    headers: Record<string, string>;
    status: number;
  }> {
    // Transform Gist URLs to raw URLs
    if (GistTransformer.isGistUrl(url)) {
      url = await GistTransformer.transformToRaw(url);
    }
    
    // Validate URL
    await this.validateURL(url);
    
    // Get timeout and max size from config
    const urlConfig = this.dependencies.getURLConfig();
    const defaultOptions = this.dependencies.getDefaultUrlOptions();
    const timeout = urlConfig?.timeout || defaultOptions.timeout;
    const maxSize = urlConfig?.maxSize || defaultOptions.maxResponseSize;
    
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Check content size
      const content = await response.text();
      if (content.length > maxSize) {
        throw new Error(`Response too large: ${content.length} bytes`);
      }
      
      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      return {
        content,
        headers,
        status: response.status
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`);
      }
      throw error;
    }
  }
  
  // --- Import Tracking ---
  
  isImporting(path: string): boolean {
    return this.importStack.has(path) || (this.dependencies.getParent()?.isImporting(path) ?? false);
  }
  
  beginImport(path: string): void {
    this.importStack.add(path);
  }

  endImport(path: string): void {
    this.importStack.delete(path);
  }
  
  // --- ImportResolverContext Implementation ---
  
  getImportApproval(): ImportApproval | undefined {
    // Walk up to root environment to find import approval
    if (this.importApproval) return this.importApproval;
    const parent = this.dependencies.getParent();
    if (parent) return parent.getImportApproval();
    return undefined;
  }
  
  getImmutableCache(): ImmutableCache | undefined {
    // Walk up to root environment to find immutable cache
    if (this.immutableCache) return this.immutableCache;
    const parent = this.dependencies.getParent();
    if (parent) return parent.getImmutableCache();
    return undefined;
  }
  
  // --- Child Creation ---
  
  createChildResolver(newFileDirectory?: string, getAllowAbsolutePaths?: () => boolean): IImportResolver {
    const childDependencies: ImportResolverDependencies = {
      ...this.dependencies,
      pathContext: newFileDirectory ? {
        ...this.dependencies.pathContext,
        fileDirectory: newFileDirectory,
        executionDirectory: newFileDirectory
      } : this.dependencies.pathContext,
      getParent: () => this,
      getAllowAbsolutePaths: getAllowAbsolutePaths || this.dependencies.getAllowAbsolutePaths
    };

    const child = new ImportResolver(childDependencies);
    // Share import stack with parent to detect circular imports across scopes
    child.importStack = this.importStack;

    return child;
  }
}
