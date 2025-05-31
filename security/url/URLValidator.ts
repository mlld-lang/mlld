import { URL } from 'url';

export interface URLSecurityConfig {
  enabled: boolean;
  allowedProtocols: string[];
  allowedDomains: string[];
  blockedDomains: string[];
  timeout: number;
  maxResponseSize: number;
  cache: {
    enabled: boolean;
    ttl: number;
    maxEntries: number;
    rules: Array<{
      pattern: string;
      ttl: number;
    }>;
  };
}

export const DEFAULT_URL_CONFIG: URLSecurityConfig = {
  enabled: true,
  allowedProtocols: ['https', 'http'],
  allowedDomains: [],
  blockedDomains: [],
  timeout: 30000,
  maxResponseSize: 10 * 1024 * 1024, // 10MB
  cache: {
    enabled: true,
    ttl: 3600000, // 1 hour
    maxEntries: 100,
    rules: []
  }
};

export class URLValidator {
  constructor(private config: URLSecurityConfig = DEFAULT_URL_CONFIG) {}
  
  /**
   * Validate a URL against security policies
   */
  async validate(urlString: string): Promise<{ valid: boolean; reason?: string }> {
    if (!this.config.enabled) {
      return { valid: true };
    }
    
    try {
      const url = new URL(urlString);
      
      // Check protocol
      if (!this.config.allowedProtocols.includes(url.protocol.replace(':', ''))) {
        return { 
          valid: false, 
          reason: `Protocol ${url.protocol} not allowed. Allowed: ${this.config.allowedProtocols.join(', ')}` 
        };
      }
      
      // Check blocked domains
      if (this.config.blockedDomains.length > 0) {
        const isBlocked = this.config.blockedDomains.some(domain => 
          url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        );
        if (isBlocked) {
          return { valid: false, reason: `Domain ${url.hostname} is blocked` };
        }
      }
      
      // Check allowed domains (if specified)
      if (this.config.allowedDomains.length > 0) {
        const isAllowed = this.config.allowedDomains.some(domain => 
          url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        );
        if (!isAllowed) {
          return { 
            valid: false, 
            reason: `Domain ${url.hostname} not in allowed list: ${this.config.allowedDomains.join(', ')}` 
          };
        }
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: `Invalid URL: ${error.message}` };
    }
  }
  
  /**
   * Check if URL is for an import (requires special handling)
   */
  isImportURL(urlString: string): boolean {
    // Import URLs need approval flow
    return urlString.endsWith('.mld') || urlString.endsWith('.mlld');
  }
}