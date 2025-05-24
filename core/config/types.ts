/**
 * Configuration types for Meld
 */

export interface MeldConfig {
  security?: SecurityConfig;
  cache?: CacheConfig;
}

export interface SecurityConfig {
  urls?: URLSecurityConfig;
}

export interface URLSecurityConfig {
  enabled: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowedProtocols?: string[];
  maxSize?: string | number; // e.g., "10MB" or 10485760
  timeout?: string | number; // e.g., "30s" or 30000
  warnOnInsecureProtocol?: boolean;
}

export interface CacheConfig {
  urls?: URLCacheConfig;
}

export interface URLCacheConfig {
  enabled: boolean;
  defaultTTL?: string; // e.g., "5m", "1h", "7d"
  rules?: CacheRule[];
}

export interface CacheRule {
  pattern: string; // URL pattern with wildcards
  ttl: string; // Human-readable duration
}

// Runtime configuration after parsing and merging
export interface ResolvedURLConfig {
  enabled: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  allowedProtocols: string[];
  maxSize: number; // In bytes
  timeout: number; // In milliseconds
  warnOnInsecureProtocol: boolean;
  cache: {
    enabled: boolean;
    defaultTTL: number; // In milliseconds
    rules: Array<{
      pattern: RegExp;
      ttl: number; // In milliseconds
    }>;
  };
}