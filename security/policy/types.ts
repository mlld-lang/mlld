/**
 * Security policy types and interfaces
 */

/**
 * Trust levels for security decisions
 */
export type TrustLevel = 'high' | 'medium' | 'low' | 'verify' | 'block';

/**
 * Command execution policy
 */
export interface CommandPolicy {
  /** Commands that are always blocked */
  blocked?: string[];
  
  /** Commands that are always allowed */
  allowed?: string[];
  
  /** Default trust level for unlisted commands */
  default?: TrustLevel;
  
  /** Patterns that require specific trust levels */
  trustedPatterns?: Array<{
    pattern: string;
    trust: TrustLevel;
  }>;
}

/**
 * Path access policy
 */
export interface PathPolicy {
  /** Paths that cannot be read */
  readBlocked?: string[];
  
  /** Paths that cannot be written */
  writeBlocked?: string[];
  
  /** Paths that can be read without approval */
  readAllowed?: string[];
  
  /** Paths that can be written without approval */
  writeAllowed?: string[];
  
  /** Default trust level for unlisted paths */
  defaultRead?: TrustLevel;
  defaultWrite?: TrustLevel;
}

/**
 * Import/URL policy
 */
export interface ImportPolicy {
  /** Domains that are always blocked */
  blockedDomains?: string[];
  
  /** Domains that are always trusted */
  trustedDomains?: string[];
  
  /** Patterns for blocked imports */
  blockedPatterns?: string[];
  
  /** Default trust level for imports */
  default?: TrustLevel;
  
  /** Maximum transitive import depth */
  maxDepth?: number;
  
  /** Require hash verification for all imports */
  requireHash?: boolean;
}

/**
 * Resolver policy
 */
export interface ResolverPolicy {
  /** Whether custom resolvers are allowed */
  allowCustom?: boolean;
  
  /** List of allowed resolver names */
  allowedResolvers?: string[];
  
  /** Whether to enforce path-only mode */
  pathOnlyMode?: boolean;
  
  /** Whether output operations are allowed */
  allowOutputs?: boolean;
  
  /** Maximum resolver timeout in milliseconds */
  timeout?: number;
}

/**
 * Complete security policy
 */
export interface SecurityPolicy {
  /** Command execution policies */
  commands?: CommandPolicy;
  
  /** Path access policies */
  paths?: PathPolicy;
  
  /** Import/URL policies */
  imports?: ImportPolicy;
  
  /** Resolver policies */
  resolvers?: ResolverPolicy;
  
  /** Policy metadata */
  metadata?: {
    version?: string;
    createdAt?: string;
    updatedAt?: string;
    description?: string;
  };
}

/**
 * Policy decision result
 */
export interface PolicyDecision {
  /** Whether the operation is allowed */
  allowed: boolean;
  
  /** Whether user approval is required */
  requiresApproval?: boolean;
  
  /** Reason for the decision */
  reason?: string;
  
  /** Which rule matched (for debugging) */
  matchedRule?: string;
  
  /** Trust level that was applied */
  trustLevel?: TrustLevel;
  
  /** Any additional constraints */
  constraints?: Record<string, any>;
}

/**
 * Security metadata from inline directives
 */
export interface SecurityMetadata {
  /** Time-to-live for cached content */
  ttl?: number;
  
  /** Trust level override */
  trust?: TrustLevel;
  
  /** Whether to require hash verification */
  requireHash?: boolean;
}

/**
 * Command analysis result from CommandAnalyzer
 */
export interface CommandAnalysis {
  /** The original command */
  command: string;
  
  /** Detected risks */
  risks: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>;
  
  /** Whether dangerous patterns were detected */
  isDangerous: boolean;
  
  /** Matched security patterns */
  matchedPatterns: string[];
}