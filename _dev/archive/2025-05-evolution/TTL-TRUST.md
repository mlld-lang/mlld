# TTL & Trust Implementation Plan

## Overview

This plan details the implementation of TTL (Time-To-Live) and Trust syntax for @path and @run directives in mlld. The feature enables inline security policy configuration and intelligent caching of external resources.

## Syntax Summary

### @path Directive
```meld
# TTL variants
@path api (30m) = [https://api.example.com/data]          # 30 minutes TTL
@path cache (7d) = [https://cdn.example.com/assets]       # 7 days TTL
@path config (1h) = [https://config.service/v1]           # 1 hour TTL
@path quick (5000) = [https://fast.api/data]              # 5000ms (bare number = ms)
@path explicit (ttl=3600000) = [https://old.syntax/v1]    # Explicit ttl= syntax

# Special keywords
@path live (live) = [https://api.example.com/current]     # Fetch fresh every use
@path archive (static) = [https://archive.org/snapshot]   # Cache forever after first fetch

# Trust levels
@path trusted (1h) = [https://mycompany.com/api] trust always
@path external (5m) = [https://external.api/data] trust verify
@path blocked = [https://suspicious.site/data] trust never
```

### @run Directive
```meld
@run [echo "safe command"] trust always
@run [curl https://api.com] trust verify
@run [rm -rf /] trust never
```

## Implementation Phases

### Phase 1: Grammar Updates (Days 1-2)

#### 1.1 Create TTL Options Pattern
```peggy
// In patterns/options.peggy (new file)

// TTL option parsing - handles (live), (static), (30m), (7d), (ttl=1000)
TTLOption "TTL option"
  = "(" _ option:TTLOptionValue _ ")" {
      return option;
    }

TTLOptionValue
  = "live" {
      return { type: 'live' };
    }
  / "static" {
      return { type: 'static' };
    }
  / value:TTLDuration unit:TTLUnit {
      return { 
        type: 'ttl',
        value: helpers.convertToMs(value, unit)
      };
    }
  / "ttl" _ "=" _ ms:Integer {
      return {
        type: 'ttl',
        value: ms
      };
    }
  / ms:Integer {
      // Bare number defaults to milliseconds
      return {
        type: 'ttl',
        value: ms
      };
    }

TTLDuration = Integer / Float
TTLUnit = "ms" / "s" / "m" / "h" / "d" / "w"

// Note: Bare numbers without unit default to milliseconds
// Examples: (3000) = 3000ms, (60s) = 60 seconds, (5m) = 5 minutes

// Trust level parsing
TrustLevel "trust level"
  = _ "trust" _ level:TrustLevelValue {
      return level;
    }

TrustLevelValue
  = "always" / "verify" / "never"
```

#### 1.2 Update @path Directive
```peggy
// In directives/path.peggy

AtPath
  = DirectiveContext "@path" _ id:BaseIdentifier _ ttl:TTLOption? _ "=" _ content:BracketContent trust:TrustLevel? {
      // Existing path logic...
      
      // Add TTL and trust to metadata
      const meta = {
        path: helpers.createPathMetadata(rawString, processedPathParts),
        ...(ttl ? { ttl } : {}),
        ...(trust ? { trust } : {})
      };
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        values,
        raw,
        meta,
        location(),
        'path'
      );
    }
```

#### 1.3 Update @run Directive
```peggy
// In directives/run.peggy

AtRun
  = DirectiveContext "@run" _ command:CommandCore trust:TrustLevel? comment:InlineComment? {
      const meta = {
        ...command.meta,
        ...(trust ? { trust } : {}),
        ...(comment ? { comment } : {})
      };
      
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        command.values,
        command.raw,
        meta,
        location(),
        'command'
      );
    }
```

#### 1.4 Add Helper Functions
```typescript
// In grammar/deps/grammar-core.ts

export const helpers = {
  // ... existing helpers ...
  
  convertToMs(value: number, unit: string): number {
    const conversions: Record<string, number> = {
      'ms': 1,
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'w': 7 * 24 * 60 * 60 * 1000
    };
    return value * (conversions[unit] || 1);
  }
};
```

### Phase 2: Type System Updates (Day 3)

#### 2.1 Update Metadata Types
```typescript
// In core/types/meta.ts

/**
 * TTL configuration for cached resources
 */
export interface TTLConfig {
  type: 'live' | 'static' | 'ttl';
  value?: number; // milliseconds for 'ttl' type
}

/**
 * Trust level for security policies
 */
export type TrustLevel = 'always' | 'verify' | 'never';

/**
 * Path directive metadata with TTL and trust
 */
export interface PathDirectiveMeta extends DirectiveMeta {
  path: PathMeta;
  ttl?: TTLConfig;
  trust?: TrustLevel;
}

/**
 * Run directive metadata with trust
 */
export interface RunMeta extends DirectiveMeta {
  riskLevel?: 'low' | 'medium' | 'high';
  trust?: TrustLevel;
  isMultiLine?: boolean;
  comment?: string;
}
```

#### 2.2 Update Lock File Types
```typescript
// In core/registry/types.ts (or appropriate location)

export interface LockFileModule {
  resolved: string;
  hash: string;
  shortHash: string;
  installedAt: string;
  ttl?: TTLConfig;
  trust?: TrustLevel;
  lastChecked?: string;
  alias?: boolean;
}
```

### Phase 3: Interpreter Integration (Days 4-5)

#### 3.1 Update Path Evaluator
```typescript
// In interpreter/eval/path.ts

function evaluatePath(node: DirectiveNode, env: Environment): void {
  // ... existing logic ...
  
  // Extract TTL and trust from metadata
  const { ttl, trust } = node.meta;
  
  // Store path with metadata
  env.setVariable(identifier, {
    type: 'path',
    value: resolvedPath,
    ttl,
    trust
  });
}
```

#### 3.2 Create TTL-Aware Cache
```typescript
// In core/registry/Cache.ts

export class TTLCache extends ImmutableCache {
  async get(key: string, metadata?: { ttl?: TTLConfig }): Promise<string | null> {
    if (metadata?.ttl?.type === 'live') {
      // Always skip cache for 'live' resources
      return null;
    }
    
    const cached = await super.get(key);
    if (!cached) return null;
    
    if (metadata?.ttl?.type === 'ttl') {
      // Check if TTL expired
      const cacheTime = await this.getCacheTime(key);
      if (Date.now() - cacheTime > metadata.ttl.value) {
        return null; // Force refresh
      }
    }
    
    // 'static' or no TTL - return cached value
    return cached;
  }
  
  async set(key: string, value: string, metadata?: { ttl?: TTLConfig }): Promise<void> {
    await super.set(key, value);
    
    // Store metadata for TTL checking
    if (metadata?.ttl) {
      await this.setMetadata(key, {
        cachedAt: Date.now(),
        ttl: metadata.ttl
      });
    }
  }
}
```

#### 3.3 Update Import Resolution
```typescript
// In interpreter/eval/import.ts

async function resolveImport(importPath: string, env: Environment): Promise<string> {
  // ... existing logic ...
  
  // Check if path has TTL metadata
  const pathVar = env.getVariable(importPath);
  if (pathVar?.ttl) {
    const cached = await env.cache.get(importPath, { ttl: pathVar.ttl });
    
    if (pathVar.ttl.type === 'live' || !cached) {
      // Fetch fresh content
      const content = await fetchContent(importPath);
      
      // Cache unless it's 'live'
      if (pathVar.ttl.type !== 'live') {
        await env.cache.set(importPath, content, { ttl: pathVar.ttl });
      }
      
      return content;
    }
    
    return cached;
  }
  
  // ... rest of existing logic ...
}
```

### Phase 4: Security Integration (Days 6-7)

#### 4.1 Update Security Manager
```typescript
// In security/SecurityManager.ts

export class SecurityManager {
  async checkCommand(command: string, metadata?: { trust?: TrustLevel }): Promise<SecurityDecision> {
    // Security precedence (more restrictive wins):
    // Global > Project > Inline
    
    // 1. Check global policy first
    const globalPolicy = await this.getGlobalPolicy();
    if (globalPolicy.isBlocked(command)) {
      return { blocked: true, reason: 'Blocked by global security policy' };
    }
    
    // 2. Check project policy
    const projectPolicy = await this.getProjectPolicy();
    if (projectPolicy.isBlocked(command)) {
      return { blocked: true, reason: 'Blocked by project security policy' };
    }
    
    // 3. Inline 'trust never' blocks at this level
    if (metadata?.trust === 'never') {
      return { blocked: true, reason: 'Explicitly marked as never trust' };
    }
    
    // 4. Now check if approval is needed
    const requiresApproval = 
      globalPolicy.requiresApproval(command) ||
      projectPolicy.requiresApproval(command) ||
      metadata?.trust === 'verify';
    
    // 5. Inline 'trust always' can skip approval (if not blocked above)
    if (metadata?.trust === 'always' && !requiresApproval) {
      return { blocked: false, requiresApproval: false };
    }
    
    return { 
      blocked: false, 
      requiresApproval,
      reason: requiresApproval ? 'Requires user approval' : undefined
    };
  }
  
  async checkPath(path: string, metadata?: { trust?: TrustLevel }): Promise<SecurityDecision> {
    // Similar logic for path access
  }
}
```

#### 4.2 Update Run Evaluator
```typescript
// In interpreter/eval/run.ts

async function evaluateRun(node: DirectiveNode, env: Environment): Promise<string> {
  const { trust } = node.meta;
  
  // Security check with trust metadata
  const decision = await env.security.checkCommand(command, { trust });
  
  if (decision.blocked) {
    throw new MlldCommandExecutionError(decision.reason);
  }
  
  if (decision.requiresApproval) {
    const approved = await env.promptApproval(command, decision);
    if (!approved) {
      throw new MlldCommandExecutionError('Command execution cancelled');
    }
  }
  
  // Execute command
  return await env.executeCommand(command);
}
```

### Phase 5: CLI Integration (Day 8)

#### 5.1 Update mlld install Command
```bash
# Support TTL in install command
mlld install @user/module --ttl 1h
mlld install [https://api.com/data] --alias apidata --ttl 5m
```

#### 5.2 Update Lock File Structure
```json
// Project ./mlld.lock.json
{
  "version": "1.0.0",
  "modules": {
    "@user/module": {
      "resolved": "...",
      "hash": "...",
      "ttl": { "type": "ttl", "value": 3600000 },
      "trust": "always"
    }
  },
  "security": {
    // Project-specific security policies
    "trustedDomains": ["mycompany.com"],
    "blockedCommands": ["rm -rf"]
  }
}

// Global ~/.config/mlld/mlld.lock.json
{
  "version": "1.0.0",
  "security": {
    // Global security policies (lower precedence than project)
    "defaultTTL": {
      "github.com": "1h",
      "*.api.com": "5m"
    },
    "blockedPaths": [
      "~/.ssh/**",
      "~/.aws/**"
    ],
    "requireApproval": ["curl", "wget"]
  }
}
```

#### 5.3 Policy Precedence
```typescript
// In security/SecurityManager.ts

async function resolvePolicies(): Promise<SecurityPolicy> {
  // 1. Load global policy from ~/.config/mlld/mlld.lock.json
  const globalPolicy = await loadGlobalPolicy();
  
  // 2. Load project policy from ./mlld.lock.json
  const projectPolicy = await loadProjectPolicy();
  
  // 3. Merge with precedence: inline > project > global
  return mergeSecurityPolicies(globalPolicy, projectPolicy);
}
```

### Phase 6: Testing & Documentation (Days 9-10)

#### 6.1 Test Cases
```meld
# tests/cases/valid/path/ttl/example.md
@path api (30m) = [https://api.example.com/data] trust always
@path live (live) = [https://api.example.com/current]
@path static (static) = [https://archive.org/snapshot] trust verify

# tests/cases/valid/run/trust/example.md
@run [echo "safe"] trust always
@run [curl https://api.com] trust verify
@run [rm -rf /] trust never
```

#### 6.2 Documentation Updates
- Update syntax reference with TTL and trust options
- Add security configuration guide
- Create caching behavior documentation
- Add examples to tutorials

## Configuration Architecture

### Lock File Hierarchy

1. **Global Lock File**: `~/.config/mlld/mlld.lock.json`
   - User's global security policies
   - Default TTLs for common domains
   - Baseline security rules

2. **Project Lock File**: `./mlld.lock.json`
   - Project dependencies and their TTLs
   - Project-specific security overrides
   - Module cache metadata

3. **Inline Directives**: In `.mld` files
   - Highest precedence
   - Override both global and project settings
   - Document-specific trust decisions

### Precedence Order

The precedence differs based on whether we're dealing with security (trust) or performance (TTL):

#### Security/Trust Precedence (More Restrictive Wins)
```
Global Lock File > Project Lock File > Inline Directives
```
- If global policy says `trust never`, it cannot be overridden
- This prevents security bypasses through untrusted scripts
- Example: If `~/.config/mlld/mlld.lock.json` blocks a domain, no project can allow it

#### TTL Precedence (More Specific Wins)
```
Inline Directives > Project Lock File > Global Lock File
```
- More specific TTL requirements override general defaults
- Allows performance tuning per-use-case
- Example: Global sets 7d cache, but you can make it `(live)` for real-time data

## User Experience Implications

### Expected Behavior

1. **Security Cannot Be Bypassed**
   - If IT/admin blocks a domain globally, scripts cannot override
   - Error: "Cannot access blocked.com - blocked by global security policy"
   - This is a feature, not a bug - prevents malicious scripts

2. **TTL Can Be Tuned**
   - Global default: Cache GitHub for 7 days
   - Project override: Cache specific repo for 1 hour
   - Script override: Make specific import `(live)` for real-time data

3. **Clear Error Messages**
   ```
   Error: Cannot execute 'rm -rf /' - blocked by global security policy
   Error: Cannot access 'malicious.site' - domain blocked by project policy
   Error: TTL '5x' is invalid - use format like '5m', '1h', '7d' or bare milliseconds
   ```

4. **Intuitive Defaults**
   - No trust specified = use policy defaults (usually 'verify')
   - No TTL specified = use policy defaults (usually cache-friendly)
   - Bare numbers = milliseconds (common in JS ecosystem)

### Migration Considerations

Since mlld has no production users yet, we can implement this cleanly without migration concerns. However, we should:

1. Ensure backward compatibility - existing syntax without TTL/trust continues to work
2. Remove references to separate config files (everything in lock files)
3. Provide clear error messages for invalid TTL formats
4. Document the lock file hierarchy clearly
5. Make security vs performance precedence very clear in docs

## Success Criteria

1. **Grammar parses all TTL variants correctly**
   - Human-readable (30m, 7d)
   - Explicit milliseconds (ttl=3600000)
   - Keywords (live, static)

2. **Trust levels work as designed**
   - `trust never` always blocks
   - `trust always` bypasses approval (if allowed by policy)
   - `trust verify` always prompts

3. **Cache respects TTL settings**
   - `live` paths fetch fresh every time
   - `static` paths cache forever
   - TTL paths refresh after expiration

4. **Security integration is seamless**
   - Trust levels integrate with existing security policies
   - Clear precedence order
   - Good error messages

5. **Performance impact is minimal**
   - TTL checking adds < 5ms overhead
   - Cache lookups remain fast
   - No impact on non-TTL paths

## Future Enhancements

1. **Global TTL defaults** in mlld.config.json
2. **TTL inheritance** for nested imports
3. **Cache warming** with `mlld cache warm`
4. **TTL analytics** to optimize cache settings
5. **Conditional TTL** based on response headers