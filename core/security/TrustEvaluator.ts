import { parse } from '@grammar/parser';
import type { LockFile } from '@core/registry/LockFile';
import { logger } from '@core/utils/logger';

export enum TrustContext {
  LOCAL_FILE = 'local_file',        // User's own files
  PRIVATE_RESOLVER = 'private_resolver', // Custom resolver
  PUBLIC_REGISTRY = 'public_registry',   // @user/module
  URL_IMPORT = 'url_import',            // Direct URL
  URL_CONTENT = 'url_content'           // URL in variable
}

export interface TrustDecision {
  trusted: boolean;
  requiresApproval: boolean;
  checkAdvisories?: boolean;
  showCommands?: boolean;
  allowTimeBasedApproval?: boolean;
  trackTaint?: boolean;
  prompt?: string;
  context: TrustContext;
}

export interface ResolverInfo {
  name: string;
  prefix: string;
  trusted: boolean;
}

/**
 * Evaluates trust context for different import sources and determines
 * what approval flow should be used
 */
export class TrustEvaluator {
  constructor(
    private lockFile?: LockFile,
    private globalLockFile?: LockFile,
    private projectPath?: string
  ) {}

  /**
   * Main entry point - evaluate trust for a source
   */
  async evaluateTrust(source: string, content?: string): Promise<TrustDecision> {
    const context = this.determineContext(source);
    
    switch (context) {
      case TrustContext.LOCAL_FILE:
        return this.evaluateLocalFile(source, content);
        
      case TrustContext.PRIVATE_RESOLVER:
        return this.evaluatePrivateResolver(source, content);
        
      case TrustContext.PUBLIC_REGISTRY:
        return this.evaluatePublicRegistry(source, content);
        
      case TrustContext.URL_IMPORT:
        return this.evaluateURLImport(source, content);
        
      case TrustContext.URL_CONTENT:
        return this.evaluateURLContent(source, content);
        
      default:
        // Fallback to strict approval
        return {
          trusted: false,
          requiresApproval: true,
          context: TrustContext.URL_IMPORT,
          prompt: 'Unknown source type - approval required'
        };
    }
  }

  /**
   * Determine the trust context based on the source
   */
  private determineContext(source: string): TrustContext {
    // Local file paths (relative or absolute to project)
    if (this.isLocalFile(source)) {
      return TrustContext.LOCAL_FILE;
    }
    
    // Module registry patterns (@user/module)
    if (this.isPublicRegistry(source)) {
      return TrustContext.PUBLIC_REGISTRY;
    }
    
    // Private resolver patterns (@prefix/...)
    if (this.isPrivateResolver(source)) {
      return TrustContext.PRIVATE_RESOLVER;
    }
    
    // URL patterns
    if (this.isURL(source)) {
      return TrustContext.URL_IMPORT;
    }
    
    // Default to local file for other patterns
    return TrustContext.LOCAL_FILE;
  }

  /**
   * Check if source is a local file
   */
  private isLocalFile(source: string): boolean {
    // URLs are not local files
    if (this.isURL(source)) {
      return false;
    }
    
    // Relative paths
    if (source.startsWith('./') || source.startsWith('../')) {
      return true;
    }
    
    // Absolute paths within project
    if (this.projectPath && source.startsWith(this.projectPath)) {
      return true;
    }
    
    // File extensions suggest local files (if not URLs)
    if (/\.(mld|mlld|md)$/.test(source)) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if source is a public registry module (@user/module)
   */
  private isPublicRegistry(source: string): boolean {
    // Standard registry pattern: @username/modulename
    return /^@[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(source);
  }

  /**
   * Check if source uses a private resolver
   */
  private isPrivateResolver(source: string): boolean {
    // Private resolver patterns like @work/module, @company/lib
    // These would be configured in lock file or config
    const privatePatterns = [
      /^@work\//,
      /^@company\//,
      /^@internal\//,
      /^@private\//
    ];
    
    return privatePatterns.some(pattern => pattern.test(source));
  }

  /**
   * Check if source is a URL
   */
  private isURL(source: string): boolean {
    try {
      const url = new URL(source);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Evaluate trust for local files
   */
  private async evaluateLocalFile(source: string, content?: string): Promise<TrustDecision> {
    logger.debug(`TrustEvaluator: Local file ${source} - auto-trusted`);
    
    return {
      trusted: true,
      requiresApproval: false,
      checkAdvisories: true, // Still check for known issues
      context: TrustContext.LOCAL_FILE
    };
  }

  /**
   * Evaluate trust for private resolvers
   */
  private async evaluatePrivateResolver(source: string, content?: string): Promise<TrustDecision> {
    const resolver = this.getResolverForSource(source);
    
    // Check if this resolver is already approved
    if (await this.isResolverApproved(resolver)) {
      logger.debug(`TrustEvaluator: Private resolver ${resolver.name} already approved`);
      return {
        trusted: true,
        requiresApproval: false,
        context: TrustContext.PRIVATE_RESOLVER
      };
    }
    
    logger.debug(`TrustEvaluator: Private resolver ${resolver.name} requires approval`);
    return {
      trusted: false,
      requiresApproval: true,
      context: TrustContext.PRIVATE_RESOLVER,
      prompt: `Do you trust the resolver '${resolver.name}' (${resolver.prefix})?`
    };
  }

  /**
   * Evaluate trust for public registry modules
   */
  private async evaluatePublicRegistry(source: string, content?: string): Promise<TrustDecision> {
    // Check if this specific module version is already approved
    const existing = await this.lockFile?.getImport(source);
    if (existing && existing.trust === 'always') {
      logger.debug(`TrustEvaluator: Registry module ${source} already approved`);
      return {
        trusted: true,
        requiresApproval: false,
        context: TrustContext.PUBLIC_REGISTRY
      };
    }
    
    logger.debug(`TrustEvaluator: Registry module ${source} requires approval`);
    return {
      trusted: false,
      requiresApproval: true,
      showCommands: true, // Always show what commands modules will run
      checkAdvisories: true,
      context: TrustContext.PUBLIC_REGISTRY,
      prompt: 'Review module permissions and security'
    };
  }

  /**
   * Evaluate trust for URL imports
   */
  private async evaluateURLImport(source: string, content?: string): Promise<TrustDecision> {
    // Check existing approvals
    const existing = await this.lockFile?.getImport(source);
    if (existing) {
      // Check if approval has expired
      if (existing.expiresAt && new Date() > new Date(existing.expiresAt)) {
        logger.debug(`TrustEvaluator: URL ${source} approval expired`);
      } else if (existing.trust === 'always' || existing.trust === 'once') {
        logger.debug(`TrustEvaluator: URL ${source} already approved`);
        return {
          trusted: true,
          requiresApproval: false,
          context: TrustContext.URL_IMPORT
        };
      }
    }
    
    logger.debug(`TrustEvaluator: URL ${source} requires approval`);
    return {
      trusted: false,
      requiresApproval: true,
      allowTimeBasedApproval: true, // URLs support time-based trust
      checkAdvisories: true,
      context: TrustContext.URL_IMPORT,
      prompt: 'Approve URL import'
    };
  }

  /**
   * Evaluate trust for URL content (in variables)
   */
  private async evaluateURLContent(source: string, content?: string): Promise<TrustDecision> {
    // For now, treat URL content the same as URL imports for consistency
    // In future, could be made safer for read-only content
    logger.debug(`TrustEvaluator: URL content ${source} - requires approval`);
    
    return {
      trusted: false,
      requiresApproval: true,
      allowTimeBasedApproval: true,
      trackTaint: true,
      context: TrustContext.URL_CONTENT
    };
  }

  /**
   * Get resolver information for a source
   */
  private getResolverForSource(source: string): ResolverInfo {
    // Extract prefix from source (e.g., @work/ from @work/module)
    const match = source.match(/^(@[^/]+)\//);
    const prefix = match ? match[1] : source;
    
    return {
      name: prefix.replace('@', ''),
      prefix: prefix,
      trusted: false
    };
  }

  /**
   * Check if a resolver is approved
   */
  private async isResolverApproved(resolver: ResolverInfo): Promise<boolean> {
    // Check project lock file first
    if (this.lockFile) {
      const security = await this.lockFile.getSecurityPolicy();
      if (security?.trustedResolvers?.includes(resolver.prefix)) {
        return true;
      }
    }
    
    // Check global lock file
    if (this.globalLockFile) {
      const security = await this.globalLockFile.getSecurityPolicy();
      if (security?.trustedResolvers?.includes(resolver.prefix)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get trust context as human-readable string
   */
  getContextDescription(context: TrustContext): string {
    switch (context) {
      case TrustContext.LOCAL_FILE:
        return 'Local file';
      case TrustContext.PRIVATE_RESOLVER:
        return 'Private resolver';
      case TrustContext.PUBLIC_REGISTRY:
        return 'Public registry module';
      case TrustContext.URL_IMPORT:
        return 'URL import';
      case TrustContext.URL_CONTENT:
        return 'URL content';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get recommended trust level for context
   */
  getRecommendedTrust(context: TrustContext): string {
    switch (context) {
      case TrustContext.LOCAL_FILE:
        return 'always';
      case TrustContext.PRIVATE_RESOLVER:
        return 'always'; // Once approved, trust the resolver
      case TrustContext.PUBLIC_REGISTRY:
        return 'once'; // Conservative for public modules
      case TrustContext.URL_IMPORT:
        return '1d'; // Time-based for URLs
      case TrustContext.URL_CONTENT:
        return 'always'; // Safe until execution
      default:
        return 'once';
    }
  }
}