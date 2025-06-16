# Merge Conflict Resolution Strategy: Security-wip → Main

## Overview

Main branch has received 58 commits since the security-wip branch diverged, introducing the Resolver pattern architecture and other enhancements. The security-wip branch contains complete security infrastructure that needs to be integrated carefully.

## Key Conflicts Identified

### 1. Environment.ts (Lines 86-93)
**Conflict**: Different approaches to reserved variable management
- **security-wip**: Static reserved names + lock file infrastructure
- **main**: Dynamic reserved names based on resolvers + resolver variable cache

**Resolution Strategy**:
```typescript
// Merge both features:
private lockFile?: LockFile; // Project lock file (from security-wip)
private globalLockFile?: LockFile; // Global lock file (from security-wip)
private reservedNames: Set<string> = new Set(['INPUT', 'TIME', 'PROJECTPATH', 'DEBUG']); // Initialize with defaults
private resolverVariableCache = new Map<string, MlldVariable>(); // Cache for resolver variables (from main)
```

This preserves security infrastructure while adopting main's dynamic resolver pattern.

### 2. LockFile.ts
**Conflict**: Different implementations of lock file functionality
- **security-wip**: Security-focused with allowedEnv, trustedDomains, commands
- **main**: Registry-focused with resolver configurations

**Resolution Strategy**:
- Merge both feature sets into a unified LockFile implementation
- Security fields (allowedEnv, commands, trustedDomains) from security-wip
- Registry fields (imports, registries) from main
- Ensure backward compatibility with existing lock files

### 3. active/10-security-integration.md
**Conflict**: Documentation differences
- This is likely a simple content conflict in the planning document
- Resolution: Merge content preserving both security plans and any main branch updates

## Architecture Integration Plan

### Resolver Pattern + Security

Main's Resolver pattern provides an excellent foundation for security integration:

1. **SecurityResolver**: Create a new resolver that wraps other resolvers
   - Intercepts all resolution requests
   - Applies security policies before delegating
   - Tracks taint information on resolved content

2. **Integration Points**:
   ```typescript
   // In ResolverManager
   registerSecurityWrapper(securityManager: SecurityManager) {
     // Wrap all existing resolvers with security checks
   }
   ```

3. **Benefits**:
   - Clean separation of concerns
   - Security policies applied uniformly across all import sources
   - Easier to test and maintain

## Step-by-Step Merge Process

### Phase 1: Prepare Security-wip
1. Create a backup branch: `git checkout -b security-wip-backup`
2. Switch back to security-wip: `git checkout security-wip`
3. Pull latest from origin: `git pull origin security-wip`

### Phase 2: Rebase Approach (Recommended)
```bash
# Start interactive rebase
git rebase -i origin/main

# During rebase:
# 1. Resolve Environment.ts conflicts as described above
# 2. Merge LockFile implementations
# 3. Update imports to use new resolver patterns
# 4. Fix test failures incrementally
```

### Phase 3: Conflict Resolution Details

#### Environment.ts Resolution
```typescript
// After line 85:
private urlCacheManager?: URLCache; // URL cache manager
private lockFile?: LockFile; // Project lock file (from security-wip)
private globalLockFile?: LockFile; // Global lock file (from security-wip)
private reservedNames: Set<string> = new Set(['INPUT', 'TIME', 'PROJECTPATH', 'DEBUG']); // Initialize with defaults
private resolverVariableCache = new Map<string, MlldVariable>(); // Cache for resolver variables (from main)
private initialNodeCount: number = 0; // Track initial nodes to prevent duplicate merging
```

#### LockFile.ts Resolution
- Merge interface definitions to include both security and registry fields
- Ensure methods from both implementations are preserved
- Add migration logic for older lock file formats

#### Test Infrastructure
- Update security tests to work with resolver pattern
- Fix import paths for new architecture
- Update mock implementations

### Phase 4: Integration Testing
1. Run existing security tests: `npm test security`
2. Run main branch tests: `npm test`
3. Create integration tests for security + resolver interaction
4. Verify @output directive security hooks work
5. Test allowedEnv filtering with @INPUT

### Phase 5: Documentation Updates
1. Update CLAUDE.md with merged architecture
2. Document security + resolver integration
3. Update migration guide for users

## Risk Mitigation

### Backup Strategy
```bash
# Before starting merge
git checkout -b merge-attempt-$(date +%Y%m%d-%H%M%S)
```

### Incremental Approach
1. First merge without security features enabled
2. Enable security features one by one
3. Test thoroughly at each step

### Rollback Plan
If merge becomes too complex:
1. Abandon current attempt
2. Cherry-pick security features individually
3. Gradually integrate over multiple PRs

## Success Criteria

1. ✅ All security tests pass
2. ✅ All main branch tests pass
3. ✅ @output directive has security hooks
4. ✅ allowedEnv filtering works
5. ✅ Development mode detection functions
6. ✅ No performance regression
7. ✅ Clean git history (if using rebase)

## Next Steps

1. **Immediate**: Fix the current merge conflicts manually
2. **Today**: Complete initial merge and run tests
3. **Tomorrow**: Fix failing tests and integration issues
4. **This Week**: Full integration testing and documentation
5. **Next Week**: Begin implementing security hooks for new features

## Commands for Resolution

```bash
# Current state: merge conflicts exist
git status

# Option 1: Continue merge with manual resolution
# Edit the conflicted files manually, then:
git add interpreter/env/Environment.ts
git add core/registry/LockFile.ts
git add active/10-security-integration.md
git merge --continue

# Option 2: Abort and try rebase approach
git merge --abort
git rebase origin/main
# Resolve conflicts during rebase
git rebase --continue

# After successful merge/rebase
npm run build
npm test
```

## Architectural Benefits of Merge

1. **Unified Import Security**: Resolver pattern provides perfect hooks for security
2. **Clean Abstractions**: Security becomes a cross-cutting concern via resolvers
3. **Better Testing**: Resolver pattern makes security policies easier to test
4. **Future Proof**: New resolvers automatically get security checks

This merge sets up mlld 1.5 with a robust, extensible security architecture that integrates cleanly with the resolver pattern from main.