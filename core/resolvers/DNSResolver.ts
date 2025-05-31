import { 
  Resolver, 
  ResolverContent, 
  ResolverType,
  ContentInfo
} from '@core/resolvers/types';
import { MlldResolutionError } from '@core/errors';
import { TaintLevel } from '@security/taint/TaintTracker';

/**
 * DNS Resolver - resolves @user/module patterns using DNS TXT records
 * This is the default resolver for public modules
 */
export class DNSResolver implements Resolver {
  name = 'dns';
  description = 'Resolves public modules using DNS TXT records at public.mlld.ai';
  type: ResolverType = 'input';

  private readonly dnsCache: Map<string, { content: string; timestamp: number }> = new Map();
  private readonly cacheTimeout = 3600000; // 1 hour

  constructor(private readonly dnsHost = 'public.mlld.ai') {}

  /**
   * Check if this resolver can handle the reference
   * DNS resolver handles @user/module pattern
   */
  canResolve(ref: string): boolean {
    // Must start with @ and have exactly one /
    if (!ref.startsWith('@')) return false;
    
    const parts = ref.slice(1).split('/');
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
  }

  /**
   * Resolve a module reference using DNS
   */
  async resolve(ref: string): Promise<ResolverContent> {
    if (!this.canResolve(ref)) {
      throw new MlldResolutionError(
        `Invalid DNS module reference format. Expected @user/module, got: ${ref}`,
        { reference: ref }
      );
    }

    const [user, module] = ref.slice(1).split('/');
    const dnsName = `${module}.${user}.${this.dnsHost}`;

    // Check cache first
    const cached = this.getCached(dnsName);
    if (cached) {
      return {
        content: cached,
        metadata: {
          source: `dns://${dnsName}`,
          timestamp: new Date(),
          taintLevel: TaintLevel.PUBLIC,
          author: user
        }
      };
    }

    try {
      // Perform DNS lookup
      const content = await this.performDNSLookup(dnsName);
      
      // Cache the result
      this.dnsCache.set(dnsName, {
        content,
        timestamp: Date.now()
      });

      return {
        content,
        metadata: {
          source: `dns://${dnsName}`,
          timestamp: new Date(),
          taintLevel: TaintLevel.PUBLIC,
          author: user
        }
      };
    } catch (error) {
      throw new MlldResolutionError(
        `Failed to resolve ${ref} via DNS: ${error.message}`,
        { 
          reference: ref,
          dnsName,
          originalError: error
        }
      );
    }
  }

  /**
   * Validate configuration (DNS resolver has no config)
   */
  validateConfig(config: any): string[] {
    if (config && Object.keys(config).length > 0) {
      return ['DNS resolver does not accept configuration'];
    }
    return [];
  }

  /**
   * Check access - DNS modules are always public/readable
   */
  async checkAccess(ref: string, operation: 'read' | 'write'): Promise<boolean> {
    if (operation === 'write') {
      return false; // DNS is read-only
    }
    return this.canResolve(ref);
  }

  /**
   * Get cached content if available and not expired
   */
  private getCached(dnsName: string): string | null {
    const cached = this.dnsCache.get(dnsName);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheTimeout) {
      this.dnsCache.delete(dnsName);
      return null;
    }

    return cached.content;
  }

  /**
   * Perform actual DNS TXT lookup
   */
  private async performDNSLookup(dnsName: string): Promise<string> {
    try {
      // Use Node.js built-in DNS resolver
      const dns = await import('dns/promises');
      const records = await dns.resolveTxt(dnsName);
      
      // TXT records are returned as arrays of arrays of strings
      // We need to find the mlld record and parse it
      for (const record of records) {
        const txtValue = record.join('');
        
        // Look for mlld format: "v=mlld1;url=..."
        if (txtValue.startsWith('v=mlld1;')) {
          const urlMatch = txtValue.match(/url=([^;]+)/);
          if (urlMatch) {
            const url = urlMatch[1];
            
            // Fetch the content from the URL
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch module content: ${response.status} ${response.statusText}`);
            }
            
            return response.text();
          }
        }
      }
      
      throw new Error(`No valid mlld record found in TXT records for ${dnsName}`);
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        throw new Error(`No DNS TXT record found for ${dnsName}`);
      }
      throw error;
    }
  }
}