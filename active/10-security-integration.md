# Workstream: Security Integration

## Overview
Complete the implementation of mlld's security architecture by connecting existing components and fixing remaining test failures. Build on the comprehensive testing infrastructure to deliver the security vision outlined in SECURITY-VISION.md.

## Current State Analysis

### ✅ Completed Infrastructure
- **Security Components**: SecurityManager, TaintTracker, CommandAnalyzer, PathValidator all implemented
- **Lock File System**: Complete LockFile class with registry/policy support
- **Resolver System**: ResolverManager with Local, GitHub, HTTP, Registry resolvers
- **Grammar Support**: TTL/trust syntax fully defined and parsing correctly
- **Testing Infrastructure**: Comprehensive framework with 25/25 core tests passing
- **Module Publishing**: Fully implemented via GitHub authentication

### ❌ Integration Gaps (Current Test Failures: 56)
- **SecurityManager Integration**: Components exist but not called during execution
- **Policy Enforcement**: No PolicyManager implementation  
- **TTL/Trust Enforcement**: Parsed but not used during execution
- **Import Approval Persistence**: Works but doesn't save decisions to lock file
- **Audit Logging**: No AuditLogger implementation
- **Taint Tracking Integration**: Not connected to interpreter execution flow

### 🧪 Test Status
- **Complete test suite**: 56 failed | 553 passed | 20 skipped (629 total)
- **Security infrastructure tests**: 25/25 passing 
- **Core failures breakdown**: ~24 from language features, ~32 from security integration gaps
- **Testing framework**: Ready to support TDD approach with reliable verification

## Implementation Plan

Based on the completed testing infrastructure and existing security components, here's the focused implementation plan to complete security integration:

**✅ ALREADY IMPLEMENTED:** PolicyManager, PolicyManagerImpl, AuditLogger, SecurityManager, TaintTracker, CommandAnalyzer, PathValidator

### Phase 1: SecurityManager Integration (Day 1-2)

The SecurityManager exists but needs to be wired to the Environment class for actual usage:

```typescript
// Update interpreter/core/interpreter.ts - Environment constructor
export class Environment {
  private securityManager?: SecurityManager;
  
  constructor(
    fileSystem: IFileSystemService,
    pathService: IPathService,
    basePath?: string,
    options?: EnvironmentOptions
  ) {
    // ... existing initialization
    
    // NEW: Initialize SecurityManager if security is enabled
    if (options?.security?.enabled !== false) {
      this.securityManager = SecurityManager.getInstance(basePath || process.cwd());
    }
  }
  
  // Add getter for testing framework
  getSecurityManager(): SecurityManager | undefined {
    return this.securityManager;
  }
}
```

### Phase 2: Environment Integration (Day 3-4)

Wire the existing SecurityManager to Environment operations:

```typescript
// Update interpreter/core/interpreter.ts - Environment class  
class Environment {
  async executeCommand(command: string, context?: ExecutionContext): Promise<string> {
    // NEW: Security check before execution
    if (this.securityManager) {
      const securityContext = this.buildSecurityContext(context);
      const allowed = await this.securityManager.checkCommand(command, securityContext);
      
      if (!allowed) {
        throw new MlldCommandExecutionError(
          `Security: Command execution blocked`,
          command,
          context?.sourceLocation
        );
      }
    }
    
    const result = await this.executeCommandImpl(command);
    
    // NEW: Track output taint
    if (this.securityManager) {
      this.securityManager.trackTaint(result, 'command_output');
    }
    
    return result;
  }
  
  async readFile(path: string, context?: ExecutionContext): Promise<string> {
    const resolvedPath = this.resolvePath(path);
    
    // NEW: Security check for path access
    if (this.securityManager) {
      const securityContext = this.buildSecurityContext(context);
      const allowed = await this.securityManager.checkPath(resolvedPath, 'read', securityContext);
      if (!allowed) {
        throw new MlldFileSystemError(`Security: Read access denied for ${path}`);
      }
    }
    
    const content = await this.fileSystem.readFile(resolvedPath);
    
    // NEW: Track file content taint
    if (this.securityManager) {
      this.securityManager.trackTaint(content, 'file_system');
    }
    
    return content;
  }
  
  async fetchURL(url: string, forImport?: boolean, context?: SecurityContext): Promise<string> {
    // NEW: Security check for URL access
    if (this.securityManager && forImport) {
      const approved = await this.securityManager.approveImport(url, '', []);
      if (!approved) {
        throw new MlldImportError(`Security: Import not approved for ${url}`);
      }
    }
    
    const content = await this.fetchURLImpl(url);
    
    // NEW: Track URL content taint
    if (this.securityManager) {
      this.securityManager.trackTaint(content, 'network');
    }
    
    return content;
  }
  
  private buildSecurityContext(context?: ExecutionContext): SecurityContext {
    return {
      file: this.currentFile,
      line: context?.sourceLocation?.start.line,
      directive: context?.directiveType,
      trust: context?.trust || 'verify',
      ttl: context?.ttl
    };
  }
}
```

### Phase 3: TTL/Trust Enforcement (Day 5-6)

Update evaluators to extract and use TTL/trust metadata from AST:

```typescript
// Update interpreter/eval/import.ts
export async function evaluateImport(node: ImportNode, env: Environment): Promise<void> {
  const source = await interpolate(node.values.source, env);
  
  // NEW: Extract TTL/trust from AST metadata
  const ttl = node.meta?.ttl || { type: 'static' };
  const trust = node.meta?.trust || 'verify';
  
  // Build security context with metadata
  const context: SecurityContext = {
    file: env.currentFile,
    directive: 'import',
    trust,
    ttl,
    sourceLocation: node.location
  };
  
  // Use TTL for caching decisions (if URL cache is available)
  if (env.urlCache && ttl.type !== 'live') {
    const cached = await env.urlCache.get(source, ttl);
    if (cached) {
      return cached; // Use cached import
    }
  }
  
  // Perform import with security context
  const content = await env.fetchURL(source, true, context);
  
  // Cache with TTL (if available)
  if (env.urlCache) {
    await env.urlCache.set(source, content, {ttl});
  }
  
  // Continue with import processing...
}

// Update interpreter/eval/run.ts
export async function evaluateRun(node: RunNode, env: Environment): Promise<string> {
  const command = await interpolate(node.values.command, env);
  
  // NEW: Use trust level from AST
  const trust = node.meta?.trust || 'verify';
  const context: ExecutionContext = {
    directiveType: 'run',
    trust,
    sourceLocation: node.location
  };
  
  return await env.executeCommand(command, context);
}

// Update interpreter/eval/path.ts  
export async function evaluatePath(node: PathNode, env: Environment): Promise<string> {
  const pathValue = await interpolate(node.values.path, env);
  
  // NEW: Use trust level from AST
  const trust = node.meta?.trust || 'verify';
  const context: ExecutionContext = {
    directiveType: 'path',
    trust,
    sourceLocation: node.location
  };
  
  return await env.readFile(pathValue, context);
}
```

### Phase 4: Lock File Automation (Day 7-8)

Update SecurityManager to automatically persist decisions:

```typescript
// Update security/SecurityManager.ts
export class SecurityManager {
  private lockFileResolver: LockFileResolver;
  
  constructor(projectPath: string) {
    // ... existing initialization
    this.lockFileResolver = new LockFileResolver(projectPath);
  }
  
  async checkCommand(command: string, context?: SecurityContext): Promise<boolean> {
    const analysis = await this.commandAnalyzer.analyze(command);
    const policy = await this.policyManager.getEffectivePolicy(context);
    const decision = this.policyManager.evaluateCommand(command, analysis, policy);
    
    // Log to audit
    await this.auditLogger.log({
      type: AuditEventType.COMMAND_EXECUTION,
      details: { command, context, decision }
    });
    
    if (decision.requiresApproval) {
      const approved = await this.importApproval.promptForApproval(
        'command',
        command,
        decision.reason || 'Command requires approval'
      );
      
      if (approved) {
        // NEW: Record approval in lock file
        await this.lockFileResolver.recordSecurityDecision('command', command, {
          ...decision,
          approved: true,
          timestamp: new Date().toISOString()
        });
      }
      
      return approved;
    }
    
    return decision.allowed;
  }
  
  async approveImport(url: string, content: string, advisories: string[]): Promise<boolean> {
    const approved = await this.importApproval.promptForApproval('import', url, content, advisories);
    
    if (approved) {
      const hash = this.calculateHash(content);
      
      // NEW: Record import approval in lock file
      await this.lockFileResolver.recordImportApproval(url, hash, 'medium', { type: 'static' });
    }
    
    return approved;
  }
}

## Testing Strategy

### Using Security Testing Framework

Each phase of implementation should be tested using the completed security testing infrastructure:

```typescript
// Example test pattern for each phase using the real framework
import { TestSetup, TestEnvironment } from '../setup/vitest-security-setup';

describe('Security Integration - Command Execution', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await TestSetup.createSecurityIntegrationTestEnv();
  });

  afterEach(async () => {
    await TestSetup.afterEach();
  });

  it('should call SecurityManager for command execution', async () => {
    await env.executeCommand('echo test');
    
    // Verify security was called using the real framework
    expect(env.wasCommandChecked('echo test')).toBe(true);
    
    // Get detailed verification
    const verification = await env.verifySecurityCalls();
    expect(verification.commandChecks).toHaveLength(1);
    expect(verification.commandChecks[0].result.allowed).toBe(true);
  });

  it('should block dangerous commands', async () => {
    env.mockCommandApproval('rm -rf /', { 
      allowed: false, 
      reason: 'Dangerous command blocked' 
    });

    await expect(env.executeCommand('rm -rf /')).rejects.toThrow();
    expect(env.wasCommandChecked('rm -rf /')).toBe(true);
  });
});
```

### TDD Implementation Approach

With the testing framework completed (25/25 tests passing), use Test-Driven Development:

1. **Write test first**: Define expected security behavior 
2. **Run test** (should fail initially)
3. **Implement minimal code** to make test pass
4. **Refactor** and improve
5. **Repeat** for each integration point

### Test Coverage Areas

1. **SecurityManager Integration** (Phase 1-2)
   - ✅ Framework ready: `TestSetup.createSecurityIntegrationTestEnv()`
   - Test that Environment constructor initializes SecurityManager
   - Verify security checks are called for commands, paths, imports
   - Test both mocked and real SecurityManager scenarios

2. **TTL/Trust Enforcement** (Phase 3)
   - ✅ Framework ready: `TTLTestFramework` with comprehensive test scenarios  
   - Test TTL extraction from AST metadata
   - Verify caching behavior based on TTL type (live/static/duration)
   - Test trust level enforcement and approval flows

3. **Lock File Persistence** (Phase 4)
   - ✅ Framework ready: `MockLockFile` with operation tracking
   - Test automatic recording of security decisions
   - Verify import approvals are persisted
   - Test lock file precedence rules (global vs project)

4. **End-to-End Workflows**
   - ✅ Framework ready: All components with verification capabilities
   - Test complete import approval flow with persistence
   - Test command execution with policy evaluation
   - Test taint propagation through variable assignments

## Success Criteria

### Implementation Milestones
- [ ] **Phase 1 Complete**: SecurityManager initialized in Environment constructor
- [ ] **Phase 2 Complete**: All Environment operations call SecurityManager methods  
- [ ] **Phase 3 Complete**: TTL/trust metadata extracted from AST and enforced
- [ ] **Phase 4 Complete**: Security decisions automatically saved to lock files

### Testing Verification (Using Real Framework)
- [ ] All security operations verifiable with `env.wasCommandChecked()`, `env.verifySecurityCalls()`
- [ ] TTL enforcement testable with `TTLTestFramework.testTTLEnforcement()`
- [ ] Lock file persistence verifiable with `MockLockFile.wasCommandApprovalAdded()`
- [ ] Full integration tests pass: `npm run test:security` (all green)

### Stability Assurance
- [ ] Core language tests remain stable: `npm test` (currently 56 failing, should not increase)
- [ ] Security infrastructure tests continue passing: 25/25 tests green
- [ ] No regressions in existing functionality

## Next Steps

### Week 1: Core Integration
1. **Day 1**: Phase 1 - SecurityManager initialization (with tests)
2. **Day 2**: Phase 2 - Environment method integration (with tests)  
3. **Day 3**: Phase 3 - TTL/trust enforcement (with tests)
4. **Day 4**: Phase 4 - Lock file automation (with tests)
5. **Day 5**: Integration testing and validation

### Week 2: Polish and Deployment
1. **Day 1-2**: Fix any remaining test failures from the 56 current failures
2. **Day 3-4**: Performance testing and optimization
3. **Day 5**: Documentation updates and final validation

The comprehensive testing infrastructure (completed in the previous conversation) provides:
- **Reliable verification** of security integration at each step
- **TDD confidence** with detailed mock tracking and verification
- **Isolation guarantees** preventing test interference  
- **Production readiness** ensuring test environments match real usage

This foundation enables rapid, confident implementation of the remaining integration gaps.