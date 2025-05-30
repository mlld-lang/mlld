# Security Integration - Resolvers as Security Boundary

**Status**: Not Started  
**Priority**: P0 - Critical for security  
**Estimated Time**: 2-3 days  
**Dependencies**: Grammar updates (for trust levels), Resolver system

## Objective

Connect the already-built security components to the interpreter with a focus on **resolvers as the primary security boundary**. This fundamentally changes our approach - by controlling resolvers, we can sandbox mlld without giving filesystem access.

## Key Insight: Resolvers ARE the Security Model

The biggest realization: if `mlld.lock.json` is read-only and resolvers are restricted, mlld becomes completely sandboxed even with full code execution. This means:
- No filesystem access except through resolvers
- No network access except through resolvers
- Complete control over data flow
- Perfect for web/sandbox environments

## Current State

### What's Built (`/security/`)
- `SecurityManager.ts` - Orchestrates all security checks
- `CommandAnalyzer.ts` - Detects dangerous command patterns  
- `PathValidator.ts` - Prevents directory traversal
- `TaintTracker.ts` - Tracks untrusted data flow
- `URLValidator.ts` - Validates URL safety
- `ImportApproval.ts` - Already integrated (only working security!)

### What's Missing
- SecurityManager is initialized but never called
- Commands execute without analysis
- Paths aren't validated
- Taint tracking is unused
- No policy enforcement

## Integration Points

### 1. Environment Initialization with Resolver-First Security
```typescript
// interpreter/env/Environment.ts
class Environment {
  constructor(options) {
    // Already has:
    this.securityManager = new SecurityManager(config);
    
    // Need to add:
    this.securityManager.initialize({
      // Resolver-based security
      pathOnlyMode: options.security?.pathOnlyMode || false,
      allowedResolvers: options.security?.allowedResolvers || ['local', 'github', 'dns'],
      allowCustomResolvers: options.security?.allowCustomResolvers ?? true,
      
      // Traditional security layers (now secondary)
      commandAnalyzer: true,
      pathValidator: true,
      taintTracker: true,
      urlValidator: true
    });
  }
}
```

### 2. Path-Only Mode Implementation
```typescript
// New security mode where ALL file access goes through resolvers
if (env.securityManager.isPathOnlyMode()) {
  // Block direct filesystem access
  if (!path.startsWith('@')) {
    throw new MlldSecurityError(
      'Path-only mode: Direct filesystem access blocked. Use resolvers like @data/file.txt'
    );
  }
  
  // Block parent directory access
  if (path.includes('../')) {
    throw new MlldSecurityError(
      'Path-only mode: Parent directory access blocked'
    );
  }
}
```

### 3. Run/Exec Directive Integration
```typescript
// interpreter/eval/run.ts
async function evaluateRun(node, env) {
  const command = await evaluateCommand(node.command, env);
  
  // Add security check:
  const analysis = await env.securityManager.analyzeCommand(command);
  if (analysis.risk === 'HIGH' && !analysis.trusted) {
    const approved = await env.securityManager.requestApproval({
      type: 'command',
      command,
      risk: analysis.risk,
      concerns: analysis.concerns
    });
    if (!approved) {
      throw new MlldSecurityError(`Command blocked by security policy: ${command}`);
    }
  }
  
  // Existing execution code...
}
```

### 4. Path Directive Integration with Resolver Checks
```typescript
// interpreter/eval/path.ts
async function evaluatePath(node, env) {
  const pathValue = await evaluatePathExpression(node.value, env);
  
  // Check if using resolver
  if (pathValue.startsWith('@')) {
    // Validate resolver is allowed
    const resolver = env.resolverManager.getResolverForPath(pathValue);
    if (!env.securityManager.isResolverAllowed(resolver)) {
      throw new MlldSecurityError(
        `Resolver '${resolver.name}' not in allowed list: ${env.securityManager.allowedResolvers.join(', ')}`
      );
    }
  } else {
    // Traditional path validation
    const validation = await env.securityManager.validatePath(pathValue, {
      basePath: env.basePath,
      operation: 'read'
    });
    
    if (!validation.allowed) {
      throw new MlldSecurityError(validation.reason);
    }
  }
  
  // Track taint:
  const taintLevel = validation.trusted ? 'FILE_SYSTEM' : 'UNTRUSTED_PATH';
  env.securityManager.taintTracker.markVariable(node.name, taintLevel);
  
  // Continue with path assignment...
}
```

### 5. Import Integration with Resolver Security
```typescript
// interpreter/eval/import.ts
async function evaluateImport(node, env) {
  // Existing approval flow works, but add:
  
  // For URL imports:
  if (source.startsWith('http')) {
    const validation = await env.securityManager.validateURL(source);
    if (!validation.allowed) {
      throw new MlldSecurityError(`URL blocked: ${validation.reason}`);
    }
  }
  
  // Track taint level:
  const taintLevel = source.startsWith('http') ? 'NETWORK' : 'FILE_SYSTEM';
  importedVars.forEach(varName => {
    env.securityManager.taintTracker.markVariable(varName, taintLevel);
  });
}
```

### 6. Taint Propagation with Resolver Awareness
```typescript
// interpreter/eval/data.ts
async function evaluateData(node, env) {
  const value = await evaluateDataValue(node.value, env);
  
  // Propagate taint from referenced variables:
  if (node.value.type === 'Reference') {
    const sourceTaint = env.securityManager.taintTracker.getTaint(node.value.name);
    env.securityManager.taintTracker.markVariable(node.name, sourceTaint);
  }
  
  // Mark resolver-sourced data
  if (value.source?.startsWith('@')) {
    const resolverTaint = env.securityManager.getResolverTaintLevel(value.source);
    env.securityManager.taintTracker.markVariable(node.name, resolverTaint);
  }
  
  // Continue with data assignment...
}
```

## Implementation Steps

### Phase 1: Wire SecurityManager (Day 1 Morning)
1. [ ] Update Environment to properly initialize SecurityManager
2. [ ] Add security config to interpreter options
3. [ ] Ensure all evaluators have access to SecurityManager
4. [ ] Add MlldSecurityError to error types

### Phase 2: Command Security (Day 1 Afternoon)
1. [ ] Integrate CommandAnalyzer in run.ts
2. [ ] Integrate CommandAnalyzer in exec.ts  
3. [ ] Add approval flow for dangerous commands
4. [ ] Test with known dangerous patterns
5. [ ] Add bypass for trusted commands (when trust level is 'always')

### Phase 3: Path Security (Day 1 Evening)
1. [ ] Integrate PathValidator in path.ts
2. [ ] Add validation for all file operations
3. [ ] Block directory traversal attempts
4. [ ] Test with malicious paths
5. [ ] Add trusted paths config

### Phase 4: Taint Tracking (Day 2 Morning)
1. [ ] Initialize taint tracker in Environment
2. [ ] Mark all imported variables with appropriate taint
3. [ ] Propagate taint through variable references
4. [ ] Add taint checks before command execution
5. [ ] Test taint flow through templates

### Phase 5: URL Security (Day 2 Afternoon)
1. [ ] Integrate URLValidator for all URL operations
2. [ ] Add protocol restrictions (https only by default)
3. [ ] Add domain allowlist/blocklist support
4. [ ] Test with various URL patterns
5. [ ] Integrate with import approval

### Phase 6: Testing & Polish (Day 2 Evening)
1. [ ] Create comprehensive security test suite
2. [ ] Test each security component in isolation
3. [ ] Test integrated security flow
4. [ ] Improve error messages
5. [ ] Add security status to debug output

## Configuration

Add to `mlld.lock.json` (not config - lock file controls security):
```json
{
  "security": {
    "policy": {
      "resolvers": {
        "allowCustom": false,
        "allowedResolvers": ["local", "github"],
        "pathOnlyMode": true  // Complete sandboxing!
      },
      "imports": {
        "maxDepth": 3,
        "requireApproval": true
      },
      "commands": {
        "analyze": true,
        "requireApproval": ["rm", "curl", "wget"]
      }
    }
  },
  "registries": [
    {
      "prefix": "@data/",
      "resolver": "local",
      "type": "input",
      "config": {
        "path": "/sandbox/readonly",
        "readonly": true
      }
    },
    {
      "prefix": "@output/",
      "resolver": "s3",
      "type": "output",
      "config": {
        "bucket": "my-outputs",
        "permissions": ["write"]
      }
    }
  ]
}
```

## Testing Strategy

### Security Test Cases
1. **Path-Only Mode**: Direct filesystem access blocked, only resolvers work
2. **Resolver Whitelist**: Non-allowed resolvers blocked
3. **Command Blocking**: Try `rm -rf /`, expect block
4. **Path Traversal**: Try `../../../etc/passwd`, expect block
5. **URL Validation**: Try `http://` URL, expect warning
6. **Taint Flow**: Import from URL, use in command, expect warning
7. **Trust Levels**: Test always/verify/never behaviors (no angle brackets!)

### Integration Tests
```mlld
# Path-only mode - only resolvers work
@path data = @data/input.json  # OK
@path fail = [./direct.json]   # BLOCKED in path-only mode

# Should prompt for approval (no angle brackets)
@run [curl https://api.example.com] trust verify

# Should block
@path secret = [/etc/passwd] trust never

# Should allow
@run [npm test] trust always

# Should track taint
@import { data } from @url https://untrusted.com
@run [echo {{data}}]  # Should warn about tainted data

# Resolver security
@import { utils } from @custom/mytools  # Blocked if custom resolvers disabled
```

## Success Criteria

- [ ] Path-only mode completely sandboxes mlld
- [ ] Resolver whitelist enforced
- [ ] All security components called during execution
- [ ] Dangerous commands blocked by default
- [ ] Path traversal attempts blocked
- [ ] URL validation working
- [ ] Taint tracking flows through variables
- [ ] Trust levels properly honored (no angle brackets)
- [ ] No performance regression
- [ ] Clear security error messages
- [ ] Lock file security policies enforced

## Notes

- **Resolvers are the security boundary** - this is the key insight
- Path-only mode enables complete sandboxing
- We provide guardrails, not guarantees (honest security posture)
- Start with blocking/warning, can tune later
- Security checks should be fast (<1ms)
- Approval UI should be clear about risks
- Consider caching security decisions
- Log all security events to `~/.mlld/audit/`
- Trust syntax uses no angle brackets: `trust verify` not `<trust verify>`

## Related Documentation

### Architecture & Vision
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - Security architecture and integration points (see Security System section)
- [`SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Core philosophy behind our security approach
- [`REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - How security fits into the broader ecosystem

### Specifications
- [`specs/ttl-trust-syntax.md`](../../specs/ttl-trust-syntax.md) - Trust level syntax being integrated
- [`specs/advisory-format.md`](../../specs/advisory-format.md) - Security advisory format for future integration
- [`specs/import-syntax.md`](../../specs/import-syntax.md) - Import security options

### Implementation References
- [`security/SecurityManager.ts`](../../../security/SecurityManager.ts) - Main security orchestrator
- [`core/security/ImportApproval.ts`](../../../core/security/ImportApproval.ts) - Working example of security integration