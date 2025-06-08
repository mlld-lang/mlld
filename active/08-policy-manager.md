# Workstream: PolicyManager Implementation

## Overview
Implement the PolicyManager component that evaluates security rules based on the lock file schema. This is the missing piece that prevents SecurityManager from working properly.

## Current State
- SecurityManager exists but has PolicyManager commented out
- Lock file schema is well-defined in lockfile-design-discussion.md
- Pattern matching needs to be implemented

## Implementation Plan

### Phase 1: PolicyManager Interface (Day 1)

```typescript
// security/policy/PolicyManager.ts
export interface PolicyManager {
  loadGlobalPolicy(): Promise<SecurityPolicy>;
  loadProjectPolicy(): Promise<SecurityPolicy>;
  mergePolicy(global: SecurityPolicy, project: SecurityPolicy, inline?: SecurityMetadata): SecurityPolicy;
  
  evaluateCommand(command: string, policy: SecurityPolicy): PolicyDecision;
  evaluatePath(path: string, operation: 'read' | 'write', policy: SecurityPolicy): PolicyDecision;
  evaluateImport(url: string, policy: SecurityPolicy): PolicyDecision;
  evaluateResolver(resolver: string, policy: SecurityPolicy): PolicyDecision;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
  matchedRule?: string;
}
```

### Phase 2: Lock File Integration (Day 2)

```typescript
// Load policies from lock files
class PolicyManagerImpl implements PolicyManager {
  private globalLockPath = path.join(os.homedir(), '.config', 'mlld', 'mlld.lock.json');
  private projectLockPath = './mlld.lock.json';
  
  async loadGlobalPolicy(): Promise<SecurityPolicy> {
    const lockFile = new LockFile(this.globalLockPath);
    return lockFile.getSecurityPolicy();
  }
  
  async loadProjectPolicy(): Promise<SecurityPolicy> {
    const lockFile = new LockFile(this.projectLockPath);
    return lockFile.getSecurityPolicy();
  }
}
```

### Phase 3: Pattern Matching Engine (Day 3)

```typescript
// Pattern matching for commands, paths, domains
class PatternMatcher {
  // Match glob patterns for paths
  matchPath(path: string, patterns: string[]): boolean {
    return patterns.some(pattern => minimatch(path, pattern));
  }
  
  // Match command patterns (support wildcards)
  matchCommand(command: string, patterns: string[]): boolean {
    // "npm run *" matches "npm run test", "npm run build", etc.
    return patterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(command);
      }
      return command.startsWith(pattern);
    });
  }
  
  // Match domains (support wildcards)
  matchDomain(url: string, patterns: string[]): boolean {
    const domain = new URL(url).hostname;
    return patterns.some(pattern => {
      if (pattern.startsWith('*.')) {
        return domain.endsWith(pattern.slice(1));
      }
      return domain === pattern;
    });
  }
}
```

### Phase 4: Policy Precedence Rules (Day 4)

```typescript
// Implement split precedence (security down, performance up)
mergePolicy(global: SecurityPolicy, project: SecurityPolicy, inline?: SecurityMetadata): SecurityPolicy {
  const merged: SecurityPolicy = {
    commands: this.mergeCommandPolicy(global.commands, project.commands, inline?.trust),
    paths: this.mergePathPolicy(global.paths, project.paths, inline?.trust),
    imports: this.mergeImportPolicy(global.imports, project.imports, inline?.trust),
    resolvers: this.mergeResolverPolicy(global.resolvers, project.resolvers)
  };
  
  return merged;
}

private mergeCommandPolicy(global: CommandPolicy, project: CommandPolicy, inlineTrust?: TrustLevel): CommandPolicy {
  // Security flows down - if global blocks, it stays blocked
  const blocked = [...(global.blocked || []), ...(project.blocked || [])];
  
  // Allowed lists are additive at project level
  const allowed = [...(global.allowed || []), ...(project.allowed || [])];
  
  // Trust level precedence for inline
  let defaultTrust = global.default || 'verify';
  if (project.default && this.isMoreRestrictive(project.default, defaultTrust)) {
    defaultTrust = project.default;
  }
  
  return { blocked, allowed, default: defaultTrust, trustedPatterns: [...] };
}
```

### Phase 5: Wire to SecurityManager (Day 5)

```typescript
// Update SecurityManager to use PolicyManager
export class SecurityManager {
  private policyManager: PolicyManager;
  
  async checkCommand(command: string, context?: SecurityContext): Promise<SecurityDecision> {
    // Load and merge policies
    const globalPolicy = await this.policyManager.loadGlobalPolicy();
    const projectPolicy = await this.policyManager.loadProjectPolicy();
    const policy = this.policyManager.mergePolicy(globalPolicy, projectPolicy, context?.metadata);
    
    // Evaluate command
    const decision = this.policyManager.evaluateCommand(command, policy);
    
    // Apply taint tracking
    const taint = this.taintTracker.getTaint(command);
    if (taint && this.requiresApprovalForTaint(taint)) {
      decision.requiresApproval = true;
    }
    
    return decision;
  }
}
```

## Testing

1. Unit tests for pattern matching
2. Policy merge precedence tests
3. Integration tests with SecurityManager
4. E2E tests with actual lock files

## Success Criteria

- [ ] PolicyManager evaluates rules from lock files
- [ ] Security precedence works (restrictive wins)
- [ ] Pattern matching handles globs and wildcards
- [ ] SecurityManager.checkCommand() returns proper decisions
- [ ] Clear error messages for policy violations