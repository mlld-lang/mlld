import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo,
  ResolverCapabilities
} from '@core/resolvers/types';
import { MlldResolutionError } from '@core/errors';
import type { TaintLevel } from '@core/types/security';

/**
 * Configuration for HTTPResolver
 */
export interface HTTPResolverConfig {
  /**
   * Base URL for resolving references
   */
  baseUrl: string;

  /**
   * Authentication headers
   */
  headers?: Record<string, string>;

  /**
   * Allowed domains (if not specified, only baseUrl domain is allowed)
   */
  allowedDomains?: string[];

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Whether to follow redirects
   */
  followRedirects?: boolean;

  /**
   * Maximum number of redirects to follow
   */
  maxRedirects?: number;

  /**
   * Cache timeout in milliseconds
   */
  cacheTimeout?: number;

  /**
   * Whether to validate SSL certificates (default: true)
   */
  validateSSL?: boolean;
}

/**
 * HTTP Resolver - provides access to modules via HTTP/HTTPS
 * Supports authentication and domain restrictions for security
 */
export class HTTPResolver implements Resolver {
  name = 'HTTP';
  description = 'Resolves modules from HTTP/HTTPS endpoints';
  type: ResolverType = 'input';
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: true, output: false },
    supportedContentTypes: ['module', 'data', 'text'],
    defaultContentType: 'text',
    priority: 20, // Same as other external resolvers
    cache: { 
      strategy: 'persistent',
      ttl: { duration: 300 } // 5 minutes
    }
  };

  private readonly cache: Map<string, { 
    content: string; 
    timestamp: number; 
    etag?: string;
    headers?: Record<string, string>;
  }> = new Map();
  
  private readonly defaultTimeout = 30000; // 30 seconds
  private readonly defaultCacheTimeout = 300000; // 5 minutes

  /**
   * Check if this resolver can handle the reference
   */
  canResolve(ref: string, config?: HTTPResolverConfig): boolean {
    // We can handle any reference if we have a valid baseUrl
    return !!config?.baseUrl;
  }

  /**
   * Resolve a reference to HTTP content
   */
  async resolve(ref: string, config?: HTTPResolverConfig): Promise<ResolverContent> {
    if (!config?.baseUrl) {
      throw new MlldResolutionError(
        'HTTPResolver requires baseUrl in configuration',
        { reference: ref }
      );
    }

    // Build the full URL
    const url = this.buildUrl(ref, config);
    
    // Validate the URL domain
    this.validateDomain(url, config);

    // Check cache first
    const cacheKey = url.toString();
    const cached = this.getCached(cacheKey, config.cacheTimeout);
    if (cached) {
      const contentType = await this.detectContentType(url.pathname, cached.content);
      const metadata = {
        source: url.toString(),
        timestamp: new Date(),
        taintLevel: 'networkCached' as TaintLevel,
        mimeType: cached.headers?.['content-type'] || 'text/plain'
      };
      return {
        content: cached.content,
        contentType,
        ctx: metadata,
        metadata
      };
    }

    try {
      // Fetch from HTTP endpoint
      const { content, etag, headers } = await this.fetchFromHttp(url, config, cached?.etag);
      
      // Update cache
      this.cache.set(cacheKey, {
        content,
        timestamp: Date.now(),
        etag,
        headers
      });

      const contentType = await this.detectContentType(url.pathname, content);
      const metadata = {
        source: url.toString(),
        timestamp: new Date(),
        taintLevel: 'networkLive' as TaintLevel,
        mimeType: headers['content-type'] || 'text/plain',
        size: parseInt(headers['content-length'] || '0', 10) || undefined
      };
      return {
        content,
        contentType,
        ctx: metadata,
        metadata
      };
    } catch (error) {
      if (error.status === 404) {
        throw new MlldResolutionError(
          `Resource not found: ${url}`,
          { reference: ref, url: url.toString() }
        );
      }
      throw new MlldResolutionError(
        `Failed to fetch from HTTP: ${error.message}`,
        { 
          reference: ref, 
          url: url.toString(),
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

    if (!config?.baseUrl) {
      errors.push('baseUrl is required');
    } else if (typeof config.baseUrl !== 'string') {
      errors.push('baseUrl must be a string');
    } else {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push('baseUrl must be a valid URL');
      }
    }

    if (config.headers !== undefined) {
      if (typeof config.headers !== 'object' || Array.isArray(config.headers)) {
        errors.push('headers must be an object');
      }
    }

    if (config.allowedDomains !== undefined) {
      if (!Array.isArray(config.allowedDomains)) {
        errors.push('allowedDomains must be an array');
      } else if (!config.allowedDomains.every(d => typeof d === 'string')) {
        errors.push('allowedDomains must contain only strings');
      }
    }

    if (config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout < 0) {
        errors.push('timeout must be a non-negative number');
      }
    }

    if (config.followRedirects !== undefined && typeof config.followRedirects !== 'boolean') {
      errors.push('followRedirects must be a boolean');
    }

    if (config.maxRedirects !== undefined) {
      if (typeof config.maxRedirects !== 'number' || config.maxRedirects < 0) {
        errors.push('maxRedirects must be a non-negative number');
      }
    }

    if (config.validateSSL !== undefined && typeof config.validateSSL !== 'boolean') {
      errors.push('validateSSL must be a boolean');
    }

    return errors;
  }

  /**
   * Check access - HTTP resolver is read-only
   */
  async checkAccess(ref: string, operation: 'read' | 'write', config?: HTTPResolverConfig): Promise<boolean> {
    if (operation === 'write') {
      return false; // HTTP resolver is read-only
    }

    if (!config?.baseUrl) {
      return false;
    }

    try {
      const url = this.buildUrl(ref, config);
      this.validateDomain(url, config);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build the full URL from reference and config
   */
  private buildUrl(ref: string, config: HTTPResolverConfig): URL {
    const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/';
    const cleanRef = ref.startsWith('/') ? ref.slice(1) : ref;
    
    try {
      return new URL(cleanRef, baseUrl);
    } catch (error) {
      throw new MlldResolutionError(
        `Invalid URL: ${baseUrl}${cleanRef}`,
        { reference: ref, baseUrl: config.baseUrl }
      );
    }
  }

  /**
   * Validate that the URL domain is allowed
   */
  private validateDomain(url: URL, config: HTTPResolverConfig): void {
    const baseUrl = new URL(config.baseUrl);
    const allowedDomains = config.allowedDomains || [baseUrl.hostname];

    if (!allowedDomains.includes(url.hostname)) {
      throw new MlldResolutionError(
        `Domain not allowed: ${url.hostname}. Allowed domains: ${allowedDomains.join(', ')}`,
        { url: url.toString(), allowedDomains }
      );
    }

    // Ensure HTTPS for security (unless explicitly disabled)
    if (url.protocol !== 'https:' && config.validateSSL !== false) {
      throw new MlldResolutionError(
        'Only HTTPS URLs are allowed for security reasons',
        { url: url.toString() }
      );
    }
  }

  /**
   * Get cached content if available
   */
  private getCached(
    key: string, 
    timeout?: number
  ): { content: string; etag?: string; headers?: Record<string, string> } | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const maxAge = timeout ?? this.defaultCacheTimeout;
    if (Date.now() - cached.timestamp > maxAge) {
      this.cache.delete(key);
      return null;
    }

    return { 
      content: cached.content, 
      etag: cached.etag,
      headers: cached.headers
    };
  }

  /**
   * Fetch content from HTTP endpoint
   */
  private async fetchFromHttp(
    url: URL,
    config: HTTPResolverConfig,
    etag?: string
  ): Promise<{ content: string; etag?: string; headers: Record<string, string> }> {
    const controller = new AbortController();
    const timeout = config.timeout || this.defaultTimeout;
    
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: HeadersInit = {
        'User-Agent': 'mlld-http-resolver',
        'Accept': 'text/plain, text/*, application/json',
        ...config.headers
      };

      if (etag) {
        headers['If-None-Match'] = etag;
      }

      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
        redirect: config.followRedirects === false ? 'manual' : 'follow'
      });

      clearTimeout(timeoutId);

      if (response.status === 304) {
        // Not modified, use cache
        const cached = this.cache.get(url.toString());
        if (cached) {
          return { 
            content: cached.content, 
            etag: cached.etag,
            headers: cached.headers || {}
          };
        }
      }

      if (!response.ok) {
        const error = new Error(`HTTP error: ${response.status} ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!this.isTextContent(contentType)) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      const content = await response.text();
      
      // Convert headers to plain object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      return {
        content,
        etag: response.headers.get('etag') || undefined,
        headers: responseHeaders
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if content type is text-based
   */
  private isTextContent(contentType: string): boolean {
    const textTypes = [
      'text/',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/x-yaml',
      'application/x-mlld'
    ];

    return textTypes.some(type => contentType.toLowerCase().includes(type));
  }

  /**
   * Detect content type based on file extension and content
   */
  private async detectContentType(filePath: string, content: string): Promise<'module' | 'data' | 'text'> {
    // Check file extension
    if (filePath.endsWith('.mld') || filePath.endsWith('.mlld')) {
      return 'module';
    }
    if (filePath.endsWith('.json')) {
      return 'data';
    }
    
    // Try to detect mlld module content
    try {
      const { parse } = await import('@grammar/parser');
      const result = await parse(content);
      if (result.success && this.hasModuleExports(result.ast)) {
        return 'module';
      }
    } catch {
      // Not valid mlld
    }
    
    // Try JSON
    try {
      JSON.parse(content);
      return 'data';
    } catch {
      // Not JSON
    }
    
    return 'text';
  }
  
  /**
   * Check if AST has module exports
   */
  private hasModuleExports(ast: any): boolean {
    // Check if there are any directive nodes (not just text/newlines)
    if (!ast || !Array.isArray(ast)) return false;
    
    return ast.some(node => 
      node && node.type === 'Directive' && 
      ['var', 'exe', 'path'].includes(node.kind)
    );
  }
}
