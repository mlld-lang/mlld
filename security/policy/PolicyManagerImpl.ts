import * as path from 'path';
import * as os from 'os';
import minimatch from 'minimatch';
import type { 
  SecurityPolicy, 
  PolicyDecision, 
  CommandAnalysis,
  SecurityMetadata,
  TrustLevel,
  CommandPolicy,
  PathPolicy,
  ImportPolicy,
  ResolverPolicy
} from './types';
import type { PolicyManager } from './PolicyManager';
import { LockFile } from '@core/registry/LockFile';
import { IMMUTABLE_SECURITY_PATTERNS } from './patterns';

/**
 * Trust level hierarchy (most to least restrictive)
 */
const TRUST_HIERARCHY: TrustLevel[] = ['block', 'verify', 'low', 'medium', 'high'];

/**
 * Default policy if none is specified
 */
const DEFAULT_POLICY: SecurityPolicy = {
  commands: {
    default: 'verify',
    blocked: [],
    allowed: []
  },
  paths: {
    defaultRead: 'medium',
    defaultWrite: 'verify',
    readBlocked: [],
    writeBlocked: []
  },
  imports: {
    default: 'verify',
    maxDepth: 10,
    requireHash: false
  },
  resolvers: {
    allowCustom: false,
    pathOnlyMode: false,
    allowOutputs: true,
    timeout: 30000
  }
};

/**
 * Implementation of PolicyManager
 */
export class PolicyManagerImpl implements PolicyManager {
  private globalLockPath = path.join(os.homedir(), '.config', 'mlld', 'mlld.lock.json');
  private projectLockPath = './mlld.lock.json';
  private cachedGlobalPolicy?: SecurityPolicy;
  private cachedProjectPolicy?: SecurityPolicy;
  
  async loadGlobalPolicy(): Promise<SecurityPolicy> {
    if (this.cachedGlobalPolicy) {
      return this.cachedGlobalPolicy;
    }
    
    try {
      const lockFile = new LockFile(this.globalLockPath);
      const policy = lockFile.getSecurityPolicy();
      this.cachedGlobalPolicy = policy || {};
      return this.cachedGlobalPolicy;
    } catch (error) {
      // No global policy exists, use empty
      return {};
    }
  }
  
  async loadProjectPolicy(): Promise<SecurityPolicy> {
    if (this.cachedProjectPolicy) {
      return this.cachedProjectPolicy;
    }
    
    try {
      const lockFile = new LockFile(this.projectLockPath);
      const policy = lockFile.getSecurityPolicy();
      this.cachedProjectPolicy = policy || {};
      return this.cachedProjectPolicy;
    } catch (error) {
      // No project policy exists, use empty
      return {};
    }
  }
  
  mergePolicy(
    global: SecurityPolicy, 
    project: SecurityPolicy, 
    inline?: SecurityMetadata
  ): SecurityPolicy {
    const merged: SecurityPolicy = {
      commands: this.mergeCommandPolicy(
        global.commands || {}, 
        project.commands || {},
        inline?.trust
      ),
      paths: this.mergePathPolicy(
        global.paths || {}, 
        project.paths || {},
        inline?.trust
      ),
      imports: this.mergeImportPolicy(
        global.imports || {}, 
        project.imports || {},
        inline
      ),
      resolvers: this.mergeResolverPolicy(
        global.resolvers || {},
        project.resolvers || {}
      ),
      metadata: {
        version: project.metadata?.version || global.metadata?.version || '1.0.0',
        updatedAt: new Date().toISOString()
      }
    };
    
    return merged;
  }
  
  evaluateCommand(command: string, analysis: CommandAnalysis, policy: SecurityPolicy): PolicyDecision {
    const commandPolicy = policy.commands || DEFAULT_POLICY.commands!;
    
    // First check immutable security patterns
    if (this.matchesImmutableBlockedCommand(command)) {
      return {
        allowed: false,
        reason: 'Command matches immutable security pattern',
        matchedRule: 'IMMUTABLE_BLOCKED_COMMAND'
      };
    }
    
    // Check if command is explicitly blocked
    if (this.matchesPatterns(command, commandPolicy.blocked || [])) {
      return {
        allowed: false,
        reason: 'Command is explicitly blocked by policy',
        matchedRule: 'BLOCKED_COMMAND'
      };
    }
    
    // Check if command is explicitly allowed
    if (this.matchesPatterns(command, commandPolicy.allowed || [])) {
      return {
        allowed: true,
        requiresApproval: false,  // Explicitly allowed commands don't need approval
        reason: 'Command is explicitly allowed by policy',
        matchedRule: 'ALLOWED_COMMAND'
      };
    }
    
    // Check trusted patterns
    const trustedPattern = this.findTrustedPattern(command, commandPolicy.trustedPatterns || []);
    if (trustedPattern) {
      return this.evaluateTrustLevel(trustedPattern.trust, `Matched pattern: ${trustedPattern.pattern}`);
    }
    
    // Apply default trust level
    const defaultTrust = commandPolicy.default || 'verify';
    return this.evaluateTrustLevel(defaultTrust, 'Default command policy');
  }
  
  evaluatePath(path: string, operation: 'read' | 'write', policy: SecurityPolicy): PolicyDecision {
    const pathPolicy = policy.paths || DEFAULT_POLICY.paths!;
    
    // First check immutable security patterns
    if (operation === 'read' && this.matchesPatterns(path, IMMUTABLE_SECURITY_PATTERNS.protectedReadPaths)) {
      return {
        allowed: false,
        reason: 'Path matches immutable read protection',
        matchedRule: 'IMMUTABLE_READ_PROTECTION'
      };
    }
    
    if (operation === 'write' && this.matchesPatterns(path, IMMUTABLE_SECURITY_PATTERNS.protectedWritePaths)) {
      return {
        allowed: false,
        reason: 'Path matches immutable write protection',
        matchedRule: 'IMMUTABLE_WRITE_PROTECTION'
      };
    }
    
    // Check policy-specific rules
    if (operation === 'read') {
      if (this.matchesPatterns(path, pathPolicy.readBlocked || [])) {
        return {
          allowed: false,
          reason: 'Path is blocked for reading by policy',
          matchedRule: 'BLOCKED_READ_PATH'
        };
      }
      
      if (this.matchesPatterns(path, pathPolicy.readAllowed || [])) {
        return {
          allowed: true,
          requiresApproval: false,
          reason: 'Path is allowed for reading by policy',
          matchedRule: 'ALLOWED_READ_PATH'
        };
      }
      
      const defaultTrust = pathPolicy.defaultRead || 'medium';
      return this.evaluateTrustLevel(defaultTrust, 'Default read policy');
    } else {
      if (this.matchesPatterns(path, pathPolicy.writeBlocked || [])) {
        return {
          allowed: false,
          reason: 'Path is blocked for writing by policy',
          matchedRule: 'BLOCKED_WRITE_PATH'
        };
      }
      
      if (this.matchesPatterns(path, pathPolicy.writeAllowed || [])) {
        return {
          allowed: true,
          requiresApproval: false,
          reason: 'Path is allowed for writing by policy',
          matchedRule: 'ALLOWED_WRITE_PATH'
        };
      }
      
      const defaultTrust = pathPolicy.defaultWrite || 'verify';
      return this.evaluateTrustLevel(defaultTrust, 'Default write policy');
    }
  }
  
  evaluateImport(url: string, policy: SecurityPolicy): PolicyDecision {
    const importPolicy = policy.imports || DEFAULT_POLICY.imports!;
    
    // Check blocked domains
    if (this.matchesDomain(url, importPolicy.blockedDomains || [])) {
      return {
        allowed: false,
        reason: 'Import domain is blocked by policy',
        matchedRule: 'BLOCKED_DOMAIN'
      };
    }
    
    // Check blocked patterns
    if (this.matchesPatterns(url, importPolicy.blockedPatterns || [])) {
      return {
        allowed: false,
        reason: 'Import matches blocked pattern',
        matchedRule: 'BLOCKED_PATTERN'
      };
    }
    
    // Check trusted domains
    if (this.matchesDomain(url, importPolicy.trustedDomains || [])) {
      return {
        allowed: true,
        requiresApproval: false,
        reason: 'Import domain is trusted by policy',
        matchedRule: 'TRUSTED_DOMAIN'
      };
    }
    
    // Apply default trust level
    const defaultTrust = importPolicy.default || 'verify';
    const decision = this.evaluateTrustLevel(defaultTrust, 'Default import policy');
    
    // Add hash requirement if specified
    if (importPolicy.requireHash) {
      decision.constraints = { requireHash: true };
    }
    
    return decision;
  }
  
  evaluateResolver(resolver: string, policy: SecurityPolicy): PolicyDecision {
    const resolverPolicy = policy.resolvers || DEFAULT_POLICY.resolvers!;
    
    // Check allowed resolver list first (if specified)
    if (resolverPolicy.allowedResolvers && resolverPolicy.allowedResolvers.length > 0) {
      if (!resolverPolicy.allowedResolvers.includes(resolver)) {
        return {
          allowed: false,
          reason: 'Resolver is not in the allowed list',
          matchedRule: 'RESOLVER_NOT_ALLOWED'
        };
      }
    }
    
    // Check if custom resolvers are allowed (only matters for non-builtin)
    if (!this.isBuiltinResolver(resolver) && !resolverPolicy.allowCustom) {
      return {
        allowed: false,
        reason: 'Custom resolvers are not allowed by policy',
        matchedRule: 'NO_CUSTOM_RESOLVERS'
      };
    }
    
    return {
      allowed: true,
      reason: 'Resolver is allowed by policy',
      matchedRule: 'ALLOWED_RESOLVER'
    };
  }
  
  async getEffectivePolicy(context?: SecurityMetadata): Promise<SecurityPolicy> {
    const global = await this.loadGlobalPolicy();
    const project = await this.loadProjectPolicy();
    return this.mergePolicy(global, project, context);
  }
  
  isMoreRestrictive(level1: TrustLevel, level2: TrustLevel): boolean {
    const index1 = TRUST_HIERARCHY.indexOf(level1);
    const index2 = TRUST_HIERARCHY.indexOf(level2);
    // Lower index means more restrictive (block=0 is most restrictive)
    return index1 < index2;
  }
  
  // Private helper methods
  
  private mergeCommandPolicy(
    global: CommandPolicy, 
    project: CommandPolicy,
    inlineTrust?: TrustLevel
  ): CommandPolicy {
    // Security flows down - blocked lists are additive
    const blocked = [...(global.blocked || []), ...(project.blocked || [])];
    
    // Allowed lists are also additive (project can add allowed commands)
    const allowed = [...(global.allowed || []), ...(project.allowed || [])];
    
    // Trust level - most restrictive wins
    const globalDefault = global.default || 'verify';
    const projectDefault = project.default || globalDefault;
    
    // Pick the more restrictive between global and project
    let defaultTrust = this.isMoreRestrictive(projectDefault, globalDefault) 
      ? projectDefault 
      : globalDefault;
    
    // If inline trust is specified and more restrictive, use it
    if (inlineTrust && this.isMoreRestrictive(inlineTrust, defaultTrust)) {
      defaultTrust = inlineTrust;
    }
    
    // Merge trusted patterns
    const trustedPatterns = [
      ...(global.trustedPatterns || []),
      ...(project.trustedPatterns || [])
    ];
    
    return { blocked, allowed, default: defaultTrust, trustedPatterns };
  }
  
  private mergePathPolicy(
    global: PathPolicy,
    project: PathPolicy,
    inlineTrust?: TrustLevel
  ): PathPolicy {
    // Blocked paths are additive
    const readBlocked = [...(global.readBlocked || []), ...(project.readBlocked || [])];
    const writeBlocked = [...(global.writeBlocked || []), ...(project.writeBlocked || [])];
    
    // Allowed paths are additive
    const readAllowed = [...(global.readAllowed || []), ...(project.readAllowed || [])];
    const writeAllowed = [...(global.writeAllowed || []), ...(project.writeAllowed || [])];
    
    // Trust levels - most restrictive wins
    const globalDefaultRead = global.defaultRead || 'medium';
    const projectDefaultRead = project.defaultRead || globalDefaultRead;
    const defaultRead = this.isMoreRestrictive(projectDefaultRead, globalDefaultRead)
      ? projectDefaultRead
      : globalDefaultRead;
    
    const globalDefaultWrite = global.defaultWrite || 'verify';
    const projectDefaultWrite = project.defaultWrite || globalDefaultWrite;
    const defaultWrite = this.isMoreRestrictive(projectDefaultWrite, globalDefaultWrite)
      ? projectDefaultWrite
      : globalDefaultWrite;
    
    return {
      readBlocked,
      writeBlocked,
      readAllowed,
      writeAllowed,
      defaultRead,
      defaultWrite
    };
  }
  
  private mergeImportPolicy(
    global: ImportPolicy,
    project: ImportPolicy,
    inline?: SecurityMetadata
  ): ImportPolicy {
    // Blocked domains and patterns are additive
    const blockedDomains = [...(global.blockedDomains || []), ...(project.blockedDomains || [])];
    const blockedPatterns = [...(global.blockedPatterns || []), ...(project.blockedPatterns || [])];
    
    // Trusted domains are additive but filtered against blocked domains
    const trustedDomains: string[] = [];
    
    // Add global trusted domains (they're already vetted)
    for (const domain of (global.trustedDomains || [])) {
      trustedDomains.push(domain);
    }
    
    // Add project trusted domains only if not blocked
    for (const domain of (project.trustedDomains || [])) {
      // Check if domain matches any blocked pattern
      let isBlocked = false;
      for (const blockedDomain of blockedDomains) {
        if (domain === blockedDomain || 
            (blockedDomain.startsWith('*.') && domain.endsWith(blockedDomain.slice(1)))) {
          isBlocked = true;
          break;
        }
      }
      if (!isBlocked && !trustedDomains.includes(domain)) {
        trustedDomains.push(domain);
      }
    }
    
    // Trust level - most restrictive wins
    const globalDefault = global.default || 'verify';
    const projectDefault = project.default || globalDefault;
    
    let defaultTrust = this.isMoreRestrictive(projectDefault, globalDefault)
      ? projectDefault
      : globalDefault;
    
    if (inline?.trust && this.isMoreRestrictive(inline.trust, defaultTrust)) {
      defaultTrust = inline.trust;
    }
    
    // Max depth - most restrictive wins
    const maxDepth = Math.min(
      global.maxDepth ?? 10,
      project.maxDepth ?? 10
    );
    
    // Hash requirement - if any level requires it, it's required
    const requireHash = (global.requireHash || project.requireHash || inline?.requireHash) ?? false;
    
    return {
      blockedDomains,
      trustedDomains,
      blockedPatterns,
      default: defaultTrust,
      maxDepth,
      requireHash
    };
  }
  
  private mergeResolverPolicy(
    global: ResolverPolicy,
    project: ResolverPolicy
  ): ResolverPolicy {
    // Security settings - most restrictive wins
    const allowCustom = (global.allowCustom && project.allowCustom) ?? false;
    const pathOnlyMode = (global.pathOnlyMode || project.pathOnlyMode) ?? false;
    const allowOutputs = (global.allowOutputs !== false && project.allowOutputs !== false);
    
    // Allowed resolvers - intersection (both must allow)
    let allowedResolvers: string[] | undefined;
    if (global.allowedResolvers || project.allowedResolvers) {
      const globalSet = new Set(global.allowedResolvers || []);
      const projectSet = new Set(project.allowedResolvers || []);
      
      if (global.allowedResolvers && project.allowedResolvers) {
        // Intersection - both must allow
        allowedResolvers = [...globalSet].filter(r => projectSet.has(r));
      } else {
        // Use whichever is defined (more restrictive)
        allowedResolvers = global.allowedResolvers || project.allowedResolvers;
      }
    }
    
    // Timeout - most restrictive (smallest) wins
    const timeout = Math.min(
      global.timeout ?? 30000,
      project.timeout ?? 30000
    );
    
    return {
      allowCustom,
      allowedResolvers,
      pathOnlyMode,
      allowOutputs,
      timeout
    };
  }
  
  private matchesPatterns(value: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Support glob patterns for paths
      if (pattern.includes('*') || pattern.includes('?')) {
        return minimatch(value, pattern, { dot: true });
      }
      // Support simple prefix matching for commands
      return value.startsWith(pattern);
    });
  }
  
  private matchesDomain(url: string, domains: string[]): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      return domains.some(domain => {
        // Support wildcard subdomains
        if (domain.startsWith('*.')) {
          const baseDomain = domain.slice(2);
          return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
        }
        return hostname === domain;
      });
    } catch {
      // Not a valid URL, no domain to match
      return false;
    }
  }
  
  private matchesImmutableBlockedCommand(command: string): boolean {
    return IMMUTABLE_SECURITY_PATTERNS.blockedCommands.some(blocked => 
      command.includes(blocked)
    );
  }
  
  private findTrustedPattern(
    command: string, 
    patterns: Array<{ pattern: string; trust: TrustLevel }>
  ): { pattern: string; trust: TrustLevel } | undefined {
    return patterns.find(p => this.matchesPatterns(command, [p.pattern]));
  }
  
  private evaluateTrustLevel(trust: TrustLevel, reason: string): PolicyDecision {
    switch (trust) {
      case 'block':
        return {
          allowed: false,
          reason,
          trustLevel: trust
        };
      
      case 'verify':
        return {
          allowed: true,
          requiresApproval: true,
          reason,
          trustLevel: trust
        };
      
      case 'low':
        return {
          allowed: true,
          requiresApproval: true,  // Low trust still requires approval
          reason,
          trustLevel: trust
        };
        
      case 'medium':
      case 'high':
        return {
          allowed: true,
          requiresApproval: false,
          reason,
          trustLevel: trust
        };
      
      default:
        // Default to verify for unknown trust levels
        return {
          allowed: true,
          requiresApproval: true,
          reason: `${reason} (unknown trust level: ${trust})`,
          trustLevel: 'verify'
        };
    }
  }
  
  private isBuiltinResolver(resolver: string): boolean {
    const builtinResolvers = ['local', 'http', 'https', 'registry', 'github'];
    return builtinResolvers.includes(resolver.toLowerCase());
  }
}