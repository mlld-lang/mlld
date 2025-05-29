# Security & Registry Integration TODO

## Critical Path to Launch

### Day 1-2: Security Integration
**Goal**: Hook up SecurityManager to actually block malicious operations

1. **PolicyManager Implementation** (4 hours)
   ```typescript
   // security/policy/PolicyManager.ts
   - Load immutable policy from ~/.mlld/security-policy.json
   - Implement evaluateCommand() method
   - Handle policy versioning/updates
   - Add mlld.lock.json to protected write paths
   ```

2. **AuditLogger Implementation** (2 hours)
   ```typescript
   // security/audit/AuditLogger.ts
   - Create audit log format
   - Implement log rotation
   - Add query interface for mlld audit command
   ```

3. **Environment Integration** (4 hours)
   ```typescript
   // interpreter/core/environment.ts
   - Replace direct command execution with SecurityManager.checkCommand()
   - Add security context to all operations
   - Implement approval prompts
   ```

4. **Interpreter Hooks** (2 hours)
   ```typescript
   // interpreter/eval/run.ts
   - Add pre-execution security check
   - Block tainted command execution
   - Add security context to errors
   ```

### Day 3: Registry Integration
**Goal**: Make mlld:// imports actually work

1. **CLI Registry Commands** (2 hours)
   ```typescript
   // cli/commands/registry.ts
   - Implement subcommands: search, info, audit, stats
   - Connect to RegistryManager
   ```

2. **Import Evaluator Update** (3 hours)
   ```typescript
   // interpreter/eval/import.ts
   - Add RegistryManager resolution
   - Handle mlld:// URLs
   - Update lock file after successful import
   ```

3. **Environment Registry Support** (2 hours)
   ```typescript
   // interpreter/core/environment.ts
   - Add RegistryManager instance
   - Pass through to import evaluator
   ```

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
   - `@run [rm -rf /]` is blocked
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
   - Clear error messages
   - Helpful suggestions
   - Minimal friction for safe operations

## Non-Goals (Post-Launch)

- Sandboxing (Docker/containers)
- Web UI for registry
- Signed modules
- Advanced permissions
- Network policies

Keep it simple, ship it fast, iterate based on feedback.