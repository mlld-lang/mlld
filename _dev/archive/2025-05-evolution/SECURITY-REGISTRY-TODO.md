# Security & Registry Integration TODO

## Current Status (as of 2025-05-29)

### ✅ Completed
- Security module structure created
- CommandAnalyzer with OWASP patterns
- TaintTracker for tracking data trust levels
- PathValidator for file access control
- RegistryResolver for mlld:// URLs
- SecurityManager integrated into Environment
- Command security checks in run.ts evaluator
- Dangerous commands (rm -rf /) are blocked
- mlld.lock.json added to protected paths

### 🚧 In Progress
- Registry resolution in import.ts evaluator
- Path validation for file operations

### ❌ Not Started
- PolicyManager implementation
- AuditLogger implementation
- Approval prompts for suspicious commands
- CLI commands for registry operations
- End-to-end security testing

## Critical Path to Launch

### Day 1-2: Security Integration
**Goal**: Hook up SecurityManager to actually block malicious operations

1. **PolicyManager Implementation** (4 hours)
   ```typescript
   // security/policy/PolicyManager.ts
   - Load immutable policy from ~/.mlld/security-policy.json
   - Implement evaluateCommand() method
   - Handle policy versioning/updates
   - Add mlld.lock.json to protected write paths ✅ DONE
   ```

2. **AuditLogger Implementation** (2 hours)
   ```typescript
   // security/audit/AuditLogger.ts
   - Create audit log format
   - Implement log rotation
   - Add query interface for mlld audit command
   ```

3. **Environment Integration** (4 hours) ✅ PARTIALLY DONE
   ```typescript
   // interpreter/env/Environment.ts
   - Added SecurityManager property ✅
   - Added getSecurityManager() method ✅
   - Added RegistryManager property ✅
   - TODO: Implement approval prompts
   ```

4. **Interpreter Hooks** (2 hours) ✅ DONE
   ```typescript
   // interpreter/eval/run.ts
   - Added pre-execution security check ✅
   - Block dangerous commands (rm -rf /) ✅
   - Added taint level detection ✅
   - Block LLM output execution ✅
   - Added security context to errors ✅
   ```

### Day 3: Registry Integration 
**Goal**: Make mlld:// imports actually work

**NOTE**: Registry implementation has changed! See `_dev/HASH-CACHE-TODO.md` for the new 
content-addressed module system. The mlld:// URLs now resolve to lock file entries rather 
than direct registry lookups.

Key changes:
- Import syntax: `@import { x } from @user/module` (no quotes)
- Lock file (`mlld.lock.json`) is source of truth
- Content-addressed cache with git-like hashes
- No network calls during execution (offline-first)

The security integration points remain the same:
- Verify content hashes before execution
- Check advisories during install (not runtime)
- Add mlld.lock.json to protected paths
- Approval flow for new imports

### Day 4-5: Testing & Polish
**Goal**: Ensure it actually works and is safe

1. **Security Test Suite** (4 hours)
   ```meld
   # tests/security/attack-scenarios.test.ts
   - Command injection attempts
   - Path traversal attempts  
   - LLM output execution attempts
   - Sensitive file access attempts
   ```

2. **Registry E2E Tests** (3 hours)
   ```meld
   # tests/registry/import-flow.test.ts
   - First import with approval
   - Cached import
   - Advisory warnings
   - Lock file updates
   ```

3. **Documentation** (3 hours)
   - Update main README with registry usage
   - Create docs/security.md
   - Update error messages with helpful context

4. **Performance Testing** (2 hours)
   - Measure security check overhead
   - Optimize hot paths
   - Ensure <50ms impact

### Day 6: Release Prep
**Goal**: Ship it!

1. **Migration Guide** (2 hours)
   - How to enable security
   - How to use registry
   - Breaking changes (if any)

2. **Release Testing** (2 hours)
   - Fresh install test
   - Upgrade test
   - Cross-platform verification

3. **Announcement Prep** (1 hour)
   - Release notes
   - Blog post draft
   - Demo video script

## Code Snippets Needed

### 1. Security Policy Loader
```typescript
// security/policy/PolicyManager.ts
export class PolicyManager {
  private policy: SecurityPolicy;
  
  async loadPolicy(): Promise<void> {
    const policyPath = path.join(os.homedir(), '.mlld', 'security-policy.json');
    
    // Check if exists, create default if not
    if (!await fs.exists(policyPath)) {
      await this.createDefaultPolicy(policyPath);
    }
    
    // Load and validate
    this.policy = await this.loadAndValidate(policyPath);
    
    // Make read-only
    await fs.chmod(policyPath, 0o444);
  }
  
  evaluateCommand(analysis: CommandAnalysis): SecurityDecision {
    // Check against patterns
    // Return decision with reasoning
  }
}
```

### 2. Pre-flight Check UI
```typescript
// cli/utils/preflight.ts
export async function preflightCheck(file: string): Promise<boolean> {
  console.log('🔍 Pre-flight Security Check\n');
  
  const risks = await analyzer.analyze(file);
  
  if (risks.length === 0) {
    console.log('✅ No security risks detected\n');
    return true;
  }
  
  console.log('Found the following operations:');
  risks.forEach(risk => {
    const icon = risk.severity === 'HIGH' ? '❌' : '⚠️';
    console.log(`  ${icon} ${risk.command}`);
    console.log(`     ${risk.reason}\n`);
  });
  
  return await confirm('Continue? [y/N]');
}
```

### 3. Registry Resolution Hook
```typescript
// interpreter/eval/import.ts
async function evaluateImport(node: ImportDirective, env: Environment) {
  let resolvedPath = node.from.value;
  
  // NEW: Registry resolution
  if (env.registryManager && resolvedPath.startsWith('mlld://')) {
    const { resolvedURL, taint, advisories } = 
      await env.securityManager.resolveImport(resolvedPath);
    
    // Show advisories if any
    if (advisories.length > 0 && !env.options.skipAdvisories) {
      const approved = await env.securityManager.approveImport(
        resolvedPath,
        '', // Content will be fetched later
        advisories
      );
      if (!approved) {
        throw new MlldImportError('Import cancelled due to advisories');
      }
    }
    
    resolvedPath = resolvedURL;
  }
  
  // Continue with normal import flow...
}
```

## Success Criteria

1. **Security Works**: 
   - `@run [rm -rf /]` is blocked ✅ VERIFIED
   - `@run [cat ~/.ssh/id_rsa]` is blocked
   - LLM command execution is blocked
   
2. **Registry Works**:
   - `@import { x } from "mlld://registry/prompts/test"` resolves
   - Lock file is created/updated
   - Cache works offline

3. **Performance**: 
   - Security checks add <50ms
   - Registry resolution is fast (cached)

4. **UX is Good**:
   - Clear error messages ✅ DONE
   - Helpful suggestions
   - Minimal friction for safe operations

## Key Context for Next Developer

### Architecture Overview
- **SecurityManager** (`/security/SecurityManager.ts`) - Central coordinator for all security subsystems
- **Environment** (`/interpreter/env/Environment.ts`) - Has SecurityManager and RegistryManager properties
- **Run Evaluator** (`/interpreter/eval/run.ts`) - Security checks integrated, blocks dangerous commands
- **Import Evaluator** (`/interpreter/eval/import.ts`) - Needs registry resolution added

### Current Integration Points
1. **Command Security** - Working! Commands are analyzed before execution
2. **Registry Resolution** - SecurityManager has registryResolver, but import.ts doesn't use it yet
3. **Path Security** - PathValidator exists but not hooked into file operations

### Test Files
- `/test-command-security.mld` - Tests command blocking (rm -rf / test)
- `/test-security.mld` - More comprehensive security tests (imports, paths)

### Next Immediate Tasks
1. **Hook registry into import.ts** - Make mlld:// URLs work
2. **Add path validation** - Block access to SSH keys, etc.
3. **Implement PolicyManager** - For user-configurable security rules
4. **Add approval prompts** - For suspicious but not blocked commands

## Non-Goals (Post-Launch)

- Sandboxing (Docker/containers)
- Web UI for registry
- Signed modules
- Advanced permissions
- Network policies

Keep it simple, ship it fast, iterate based on feedback.