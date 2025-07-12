import type { MlldNode, SourceLocation, DirectiveNode } from '@core/types';
import type { Variable, VariableSource, PipelineInput, VariableMetadata } from '@core/types/variable';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import type { ResolvedURLConfig } from '@core/config/types';
import type { FuzzyMatchConfig } from '@core/resolvers/types';
import * as path from 'path';
import { ImportApproval } from '@core/security/ImportApproval';
import { ImmutableCache } from '@core/security/ImmutableCache';
import { GistTransformer } from '@core/security/GistTransformer';
import { SecurityManager } from '@security';
import { RegistryManager, ModuleCache, LockFile } from '@core/registry';
import { URLCache } from '../cache/URLCache';
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

/**
 * Dependencies needed by ImportResolver from the Environment
 */
export interface ImportResolverDependencies {
  fileSystem: IFileSystemService;
  pathService: IPathService;
  basePath: string;
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
}

/**
 * Context interface for parent environments in the import resolution chain
 */
export interface ImportResolverContext {
  isImporting(path: string): boolean;
  getImportApproval(): ImportApproval | undefined;
  getImmutableCache(): ImmutableCache | undefined;
  getURLCache(): URLCache | undefined;
}

/**
 * Interface for the ImportResolver
 */
export interface IImportResolver {
  // Module resolution
  resolveModule(reference: string, context?: 'import' | 'path' | 'variable'): Promise<{ 
    content: string; 
    contentType: 'module' | 'data' | 'text'; 
    metadata?: any 
  }>;
  
  // File and URL operations
  readFile(pathOrUrl: string): Promise<string>;
  resolvePath(inputPath: string): Promise<string>;
  getProjectPath(): Promise<string>;
  
  // URL operations
  isURL(path: string): boolean;
  areURLsEnabled(): boolean;
  validateURL(url: string): Promise<void>;
  fetchURL(url: string, forImport?: boolean): Promise<string>;
  fetchURLWithSecurity(
    url: string, 
    security?: import('@core/types/primitives').SecurityOptions,
    configuredBy?: string
  ): Promise<string>;
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
  createChildResolver(newBasePath?: string): IImportResolver;
}

/**
 * ImportResolver handles all import, resolution, and URL operations for Environment
 */
export class ImportResolver implements IImportResolver, ImportResolverContext {
  private importStack: Set<string> = new Set();
  private pathMatcher?: PathMatcher;
  private importApproval?: ImportApproval;
  private immutableCache?: ImmutableCache;
  private urlCacheManager?: URLCache;
  
  constructor(private dependencies: ImportResolverDependencies) {
    // Initialize PathMatcher for fuzzy file matching
    this.pathMatcher = new PathMatcher(dependencies.fileSystem);
    
    // Initialize security components for root environment only
    if (!dependencies.getParent()) {
      try {
        const basePath = dependencies.basePath;
        this.importApproval = new ImportApproval(basePath);
        this.immutableCache = new ImmutableCache(basePath);
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
  async resolveModule(reference: string, context?: 'import' | 'path' | 'variable'): Promise<{ content: string; contentType: 'module' | 'data' | 'text'; metadata?: any }> {
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
      console.error('Resolver result structure:', JSON.stringify(result, null, 2));
      throw new Error(`Resolver returned invalid content structure for '${reference}': missing content or contentType`);
    }
    
    // The result.content is already the resolver's result object
    return {
      content: result.content.content,
      contentType: result.content.contentType,
      metadata: result.content.metadata
    };
  }
  
  // --- File and URL Operations ---
  
  async readFile(pathOrUrl: string): Promise<string> {
    if (this.isURL(pathOrUrl)) {
      return this.fetchURL(pathOrUrl);
    }
    const resolvedPath = await this.resolvePath(pathOrUrl);
    
    return this.dependencies.fileSystem.readFile(resolvedPath);
  }
  
  async resolvePath(inputPath: string): Promise<string> {
    // Handle special path variables
    if (inputPath.startsWith('@PROJECTPATH')) {
      inputPath = inputPath.replace('@PROJECTPATH', await this.getProjectPath());
    }
    
    // Use the path module that's already imported
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    
    // Check if fuzzy matching is enabled for local files
    const localFileFuzzyMatch = this.dependencies.getLocalFileFuzzyMatch();
    const fuzzyEnabled = typeof localFileFuzzyMatch === 'boolean' 
      ? localFileFuzzyMatch 
      : localFileFuzzyMatch.enabled !== false;
    
    // Debug log
    if (process.env.DEBUG_FUZZY) {
      console.log(`resolvePath called with: ${inputPath}, fuzzyEnabled: ${fuzzyEnabled}`);
    }
    
    if (fuzzyEnabled && this.pathMatcher) {
      // Try fuzzy matching for local files
      const matchResult = await this.pathMatcher.findMatch(
        inputPath,
        this.dependencies.basePath,
        typeof localFileFuzzyMatch === 'object' ? localFileFuzzyMatch : undefined
      );
      
      if (matchResult.path) {
        if (process.env.DEBUG_FUZZY) {
          console.log(`Fuzzy match found: ${matchResult.path}`);
        }
        return matchResult.path;
      }
      
      // If no match found with fuzzy matching, check with extensions
      if (!path.extname(inputPath)) {
        const extensions = ['.mlld.md', '.mld', '.md'];
        const allSuggestions: string[] = [];
        
        for (const ext of extensions) {
          const pathWithExt = inputPath + ext;
          const extMatchResult = await this.pathMatcher.findMatch(
            pathWithExt,
            this.dependencies.basePath,
            typeof localFileFuzzyMatch === 'object' ? localFileFuzzyMatch : undefined
          );
          
          if (extMatchResult.path) {
            return extMatchResult.path;
          }
          
          // Collect suggestions from each extension attempt
          if (extMatchResult.suggestions) {
            allSuggestions.push(...extMatchResult.suggestions);
          }
        }
        
        // If we collected any suggestions, throw error with them
        if (allSuggestions.length > 0) {
          // Remove duplicates and take top 3
          const uniqueSuggestions = [...new Set(allSuggestions)].slice(0, 3);
          const suggestions = uniqueSuggestions
            .map(s => `  - ${s}`)
            .join('\n');
          throw new Error(`File not found: ${inputPath}\n\nDid you mean:\n${suggestions}`);
        }
      }
      
      // If still no match and we have suggestions, throw error here
      // This ensures fuzzy matching suggestions are included
      if (matchResult.suggestions && matchResult.suggestions.length > 0) {
        const suggestions = matchResult.suggestions
          .slice(0, 3)
          .map(s => `  - ${s}`)
          .join('\n');
        throw new Error(`File not found: ${inputPath}\n\nDid you mean:\n${suggestions}`);
      }
      
      // If we have candidates (ambiguous matches), throw error
      if (matchResult.candidates && matchResult.candidates.length > 1) {
        const candidates = matchResult.candidates
          .map(c => `  - ${c.path} (${c.matchType} match, confidence: ${c.confidence})`)
          .join('\n');
        throw new Error(`Ambiguous file match for: ${inputPath}\n\nMultiple files match:\n${candidates}`);
      }
    }
    
    // Fall back to standard path resolution, but check if the file exists
    const resolvedPath = path.resolve(this.dependencies.basePath, inputPath);
    
    // If fuzzy matching is enabled but didn't find anything, check if the file exists
    // If not, throw an error with better messaging
    if (fuzzyEnabled && !await this.dependencies.fileSystem.exists(resolvedPath)) {
      throw new Error(`File not found: ${inputPath}`);
    }
    
    return resolvedPath;
  }
  
  async getProjectPath(): Promise<string> {
    // Walk up from basePath to find project root
    let current = this.dependencies.basePath;
    
    while (current !== path.dirname(current)) {
      try {
        // Check for common project indicators in order of preference
        const indicators = [
          'mlld.config.json',
          'package.json',
          '.git',
          'pyproject.toml',
          'Cargo.toml',
          'pom.xml',
          'build.gradle',
          'Makefile'
        ];
        
        for (const indicator of indicators) {
          if (await this.dependencies.fileSystem.exists(path.join(current, indicator))) {
            return current;
          }
        }
      } catch {
        // Continue searching
      }
      current = path.dirname(current);
    }
    
    // Fallback to current base path
    return this.dependencies.basePath;
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
  
  async fetchURL(url: string, forImport: boolean = false): Promise<string> {
    // Transform Gist URLs to raw URLs
    if (GistTransformer.isGistUrl(url)) {
      url = await GistTransformer.transformToRaw(url);
    }
    
    // For imports, check immutable cache first
    if (forImport && this.getImmutableCache()) {
      const cached = await this.getImmutableCache()!.get(url);
      if (cached) {
        return cached;
      }
    }
    
    // Check if caching is enabled
    const urlConfig = this.dependencies.getURLConfig();
    const cacheEnabled = urlConfig?.cache.enabled ?? true;
    
    if (cacheEnabled && !forImport) {
      // Check runtime cache for non-imports
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
      
      // For imports, check approval and cache in immutable cache
      const approveAllImports = this.dependencies.getApproveAllImports();
      if (forImport && this.getImportApproval() && !approveAllImports) {
        const approved = await this.getImportApproval()!.checkApproval(url, content);
        if (!approved) {
          throw new Error('Import not approved by user');
        }
        
        // Store in immutable cache
        if (this.getImmutableCache()) {
          await this.getImmutableCache()!.set(url, content);
        }
      } else if (forImport && approveAllImports) {
        // Auto-approved, just store in immutable cache
        if (this.getImmutableCache()) {
          await this.getImmutableCache()!.set(url, content);
        }
      }
      
      // Cache the response with URL-specific TTL for non-imports
      if (cacheEnabled && !forImport) {
        const ttl = this.getURLCacheTTL(url);
        this.dependencies.cacheManager.setURLCacheEntry(url, content, ttl);
      }
      
      return content;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`);
      }
      throw error;
    }
  }
  
  private getURLCacheTTL(url: string): number {
    return this.dependencies.cacheManager.getURLCacheTTL(url);
  }
  
  /**
   * Fetch URL with security options from @path directive
   */
  async fetchURLWithSecurity(
    url: string, 
    security?: import('@core/types/primitives').SecurityOptions,
    configuredBy?: string
  ): Promise<string> {
    const urlCache = this.getURLCache();
    
    if (urlCache && security) {
      // Use the new URL cache with security options
      return urlCache.fetchURL(url, security, configuredBy);
    }
    
    // Fall back to existing fetchURL method
    return this.fetchURL(url);
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
  
  getURLCache(): URLCache | undefined {
    const parent = this.dependencies.getParent();
    if (parent) {
      return parent.getURLCache();
    }
    return this.dependencies.cacheManager.getURLCacheManager();
  }
  
  // --- Child Creation ---
  
  createChildResolver(newBasePath?: string): IImportResolver {
    const childDependencies: ImportResolverDependencies = {
      ...this.dependencies,
      basePath: newBasePath || this.dependencies.basePath,
      getParent: () => this
    };
    
    const child = new ImportResolver(childDependencies);
    // Share import stack with parent to detect circular imports across scopes
    child.importStack = this.importStack;
    
    return child;
  }
}