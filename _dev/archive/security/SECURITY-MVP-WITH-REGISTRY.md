# Security MVP with Registry Integration

## Overview

This document updates the Security MVP plan to include the "DNS for Gists" registry implementation, showing how both can be built together in a cohesive 8-day sprint.

## Updated Architecture

```
security/
├── command/           # Command execution security
├── path/             # Path access control  
├── import/           # Import security (existing)
├── registry/         # NEW: Registry client
│   ├── RegistryResolver.ts    # Resolves mlld:// URLs
│   ├── AdvisoryChecker.ts     # Checks security advisories
│   └── index.ts
├── cache/            # Immutable caching (existing)
├── policy/           # Security policies
├── SecurityManager.ts # Central coordinator
└── index.ts
```

## Implementation Timeline (8 Days)

### Days 1-2: Security Foundation + Registry Client

#### Security Tasks:
- [ ] Create security module structure
- [ ] Move existing security code (ImportApproval, ImmutableCache)
- [ ] Implement CommandAnalyzer with OWASP patterns
- [ ] Create immutable security patterns

#### Registry Tasks:
- [ ] Create RegistryResolver for mlld://registry/ URLs
- [ ] Implement registry.json fetching with caching
- [ ] Add mlld://gist/ URL support
- [ ] Integrate with existing ImportApproval

**Key Integration**: The RegistryResolver becomes part of the security layer, not separate from it.

### Days 3-4: Advisory System + Taint Tracking

#### Security Tasks:
- [ ] Implement taint tracking system
- [ ] Add LLM output detection
- [ ] Create path security validator
- [ ] Block sensitive path access

#### Registry Tasks:
- [ ] Implement AdvisoryChecker
- [ ] Create advisory prompt flow
- [ ] Add advisory checking to import flow
- [ ] Cache advisory data

**Key Integration**: Advisories become part of the taint system:
```typescript
enum TaintLevel {
  TRUSTED = 'trusted',
  REGISTRY_SAFE = 'registry_safe',     // No advisories
  REGISTRY_WARNING = 'registry_warning', // Has advisories
  GIST_DIRECT = 'gist_direct',         // Direct gist import
  LLM_OUTPUT = 'llm_output',           // HIGHEST RISK
}
```

### Days 5-6: Command Security + CLI Integration

#### Security Tasks:
- [ ] Integrate command security hooks
- [ ] Add pre-flight security checks
- [ ] Implement audit logging
- [ ] Create security CLI commands

#### Registry Tasks:
- [ ] Add `mlld registry search` command
- [ ] Add `mlld registry audit` command
- [ ] Add `mlld registry info` command
- [ ] Update import resolution in interpreter

**Unified CLI**:
```bash
mlld security audit     # Checks everything (commands, paths, imports)
mlld registry audit     # Just registry imports
mlld audit             # Alias for security audit
```

### Days 7-8: Testing & Polish

- [ ] Integration tests for security + registry
- [ ] Attack scenario testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Error message improvements

## Unified Import Flow

```meld
@import { reviewer } from "mlld://registry/prompts/code-review"
```

Processing flow:
```
1. Parse import → "mlld://registry/prompts/code-review"
                        ↓
2. RegistryResolver → Fetch registry.json (cached)
                        ↓
3. Resolve to → "mlld://gist/anthropics/abc123"
                        ↓
4. AdvisoryChecker → Check advisories for module + gist
                        ↓
5. ImportApproval → Show preview with any warnings
                        ↓
6. User consent → Lock specific gist revision
                        ↓
7. ImmutableCache → Store content by hash
                        ↓
8. TaintTracker → Mark as REGISTRY_SAFE or REGISTRY_WARNING
```

## Security Properties

### 1. Registry Imports Are Not Special
- They go through the same security flow as any import
- They get the same approval prompts
- They're subject to the same policies

### 2. Advisories Affect Taint Level
```typescript
// In TaintTracker
markImport(content: string, source: string, advisories: Advisory[]) {
  if (source.startsWith('mlld://registry/')) {
    if (advisories.length > 0) {
      return TaintLevel.REGISTRY_WARNING;
    }
    return TaintLevel.REGISTRY_SAFE;
  }
  // ... other sources
}
```

### 3. Command Execution Checks Registry Source
```typescript
// In CommandAnalyzer
async analyze(command: string, context: CommandContext) {
  const taint = context.taint;
  
  if (taint === TaintLevel.REGISTRY_WARNING) {
    risks.push({
      type: 'KNOWN_VULNERABLE',
      severity: 'HIGH',
      description: 'Command from import with security advisories'
    });
  }
}
```

## Configuration

### Default mlld.config.json
```json
{
  "security": {
    "registry": {
      "enabled": true,
      "advisoryCheck": true,
      "cacheTime": 3600000,
      "trustedPublishers": [
        "mlld-lang",
        "anthropics"
      ]
    },
    "imports": {
      "requireApproval": true,
      "pinByDefault": true
    },
    "commands": {
      "preFlightCheck": true,
      "blockLLMExecution": true
    }
  }
}
```

## Testing Strategy

### Security Test Cases
```meld
# Test 1: Block malicious command
@run [rm -rf /]  # BLOCKED

# Test 2: Block LLM execution  
@text cmd = @run [llm "generate command"]
@run [@cmd]  # BLOCKED

# Test 3: Block sensitive paths
@text key = [~/.ssh/id_rsa]  # BLOCKED
```

### Registry Test Cases
```meld
# Test 4: Registry import with advisory
@import { scanner } from "mlld://registry/utils/file-scanner"
# Shows advisory warning, requires approval

# Test 5: Direct gist import
@import { tool } from "mlld://gist/user/gist-id"  
# Standard approval, marked as GIST_DIRECT taint

# Test 6: Trusted publisher
@import { official } from "mlld://registry/mlld-lang/tool"
# Still requires approval but shows "Trusted Publisher"
```

## Benefits of Combined Approach

1. **Single Security Flow**: Registry imports aren't special - same security applies
2. **Unified Taint System**: Registry advisories integrate with taint tracking
3. **Consistent UX**: Users learn one approval flow for all imports
4. **Shared Infrastructure**: ImmutableCache, ImportApproval used by both
5. **Holistic Security**: Can't bypass security by using registry

## MVP Deliverables

### Week 1 Sprint Results:
1. ✅ Command execution security (blocks obvious attacks)
2. ✅ Path access security (protects SSH keys, etc.)
3. ✅ LLM output blocking (prevents injection)
4. ✅ Registry with human-friendly names
5. ✅ Security advisory system
6. ✅ Unified import approval flow
7. ✅ Audit commands for both security + registry

### What We DON'T Build (Yet):
- Sandboxing (Docker/containers)
- Signed modules
- Version resolution (just latest)
- Web UI
- Advanced permissions

## Success Metrics

1. **Zero false negatives** on test attacks
2. **< 100ms** registry resolution (with cache)
3. **Clear advisory warnings** before import
4. **No UX difference** between registry/direct imports
5. **< 500 lines** of registry code (keeps it simple)

## Next Steps After MVP

1. **Lock file support** - Record approved imports
2. **Version support** - `@1.2.0` syntax
3. **Publisher verification** - GitHub org verification
4. **Enhanced advisories** - CVE integration
5. **Sandboxed execution** - For high-risk imports

This integrated approach means we ship both security AND registry in one coherent system, rather than bolting them together later.