/**
 * Configuration types for Meld
 */

export interface MeldConfig {
  security?: SecurityConfig;
  cache?: CacheConfig;
}

export interface SecurityConfig {
  urls?: URLSecurityConfig;
  imports?: ImportSecurityConfig;
}

export interface ImportSecurityConfig {
  requireApproval?: boolean; // Default true
  allowed?: ImportAllowEntry[];
  pinByDefault?: boolean; // Default true
  maxSize?: string | number; // Max import file size
}

export interface ImportAllowEntry {
  url: string;
  hash: string; // SHA256 hash of content
  pinnedVersion: boolean;
  allowedAt: string; // ISO date string
  detectedCommands?: string[]; // Commands found in the import
}

export interface URLSecurityConfig {
  enabled: boolean;
  allow?: string[]; // URL patterns like "https://gist.github.com/adamavenir/*"
  allowedDomains?: string[]; // Backwards compat, but allow patterns are preferred
  blockedDomains?: string[];
  allowedProtocols?: string[];
  maxSize?: string | number; // e.g., "10MB" or 10485760
  timeout?: string | number; // e.g., "30s" or 30000
  warnOnInsecureProtocol?: boolean;
  requireReviewOnUpdate?: boolean; // Require manual review when cached content changes
  gists?: GistSecurityConfig;
}

export interface GistSecurityConfig {
  enabled: boolean;
  allowedUsers?: string[]; // GitHub usernames
  allowedGists?: string[]; // Specific gist IDs
  pinToVersion?: boolean; // If true, lock to specific version, don't auto-update
  transformUrls?: boolean; // Auto-transform gist.github.com to raw URLs
}

export interface CacheConfig {
  urls?: URLCacheConfig;
}

export interface URLCacheConfig {
  enabled: boolean;
  immutable?: boolean; // If true (default), cached content never auto-refreshes
  autoRefresh?: URLAutoRefreshConfig; // Opt-in auto-refresh with rules
  storageLocation?: string; // Where to store cached files
}

export interface URLAutoRefreshConfig {
  enabled: boolean;
  defaultTTL?: string; // e.g., "5m", "1h", "7d"
  rules?: CacheRule[];
  requireReview?: boolean; // Show diff and require approval before updating
}

export interface CacheRule {
  pattern: string; // URL pattern with wildcards
  ttl: string; // Human-readable duration
  requireReview?: boolean; // Override global requireReview for this pattern
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