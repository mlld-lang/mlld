# Security Integration TODO

## Overview

The security architecture is built but not connected. This document outlines the specific integration tasks needed to make security features functional.

## ✅ COMPLETED AS OF 2025-05-29

### What's Been Done
1. **Security Module Structure** - All components created in `/security/`
2. **Environment Integration** - SecurityManager added to Environment class
3. **Command Security** - run.ts now blocks dangerous commands like `rm -rf /`
4. **Basic Integration** - Commands are analyzed before execution

### What Works Now
- `@run [rm -rf /]` is blocked with error: "Security: Command blocked - Attempting to delete root filesystem!"
- Command analysis detects dangerous patterns
- Security warnings shown for suspicious commands
- Taint level detection (though not fully propagated)

## Critical Path Integration Tasks

### 1. Hook Security into Command Execution (Day 1) ✅ IMPLEMENTED DIFFERENTLY

**Status**: DONE - But implemented without the full PolicyManager/AuditLogger flow

**File**: `interpreter/eval/run.ts`

**What was implemented**:
```typescript
// Actual implementation in run.ts:
const security = env.getSecurityManager();
if (security) {
  const taintLevel = determineTaintLevel(commandNodes, env);
  const analyzer = (security as any).commandAnalyzer;
  if (analyzer) {
    const analysis = await analyzer.analyze(command);
    
    // Block immediately dangerous commands
    if (analysis.blocked) {
      const reason = analysis.risks?.[0]?.description || 'Security policy violation';
      throw new MlldCommandExecutionError(
        `Security: Command blocked - ${reason}`,
        directive.location,
        { /* error details */ }
      );
    }
    
    // Block LLM output execution
    if (taintLevel === TaintLevel.LLM_OUTPUT) {
      throw new MlldCommandExecutionError(
        'Security: Cannot execute LLM-generated commands',
        directive.location,
        { /* error details */ }
      );
    }
  }
}
```

**Original plan code (for reference)**:

export async function evaluateRun(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // ... existing code ...
  
  if (directive.subtype === 'runCommand') {
    const command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand);
    
    // NEW: Security check
    const security = env.getSecurityManager();
    if (security) {
      const taint = env.getVariableTaint(commandNodes); // Need to implement
      const decision = await security.checkCommand(command, {
        file: env.getCurrentFilePath(),
        line: directive.location?.line,
        taint
      });
      
      if (decision.blocked) {
        throw new MlldSecurityError(decision.reason);
      }
      
      if (decision.requiresApproval) {
        // Show approval prompt (reuse ImportApproval pattern)
        const approved = await security.promptCommandApproval(command, decision);
        if (!approved) {
          throw new MlldSecurityError('Command execution cancelled by user');
        }
      }
    }
    
    // Continue with execution...
  }
}
```

### 2. Connect Registry Resolution to Imports (Day 1)

**NOTE: Registry design has changed! See `_dev/HASH-CACHE-TODO.md` for new approach**

The new import system uses:
- Lock file (`mlld.lock.json`) as source of truth
- Content-addressed cache with SHA256 hashes
- Import syntax: `@import { x } from @user/module` (no quotes)
- All security checks happen at install time, not runtime

**File**: `interpreter/eval/import.ts`

```typescript
// NEW: Handle module references (no quotes/brackets)
if (node.source.type === 'module-reference' || node.source.type === 'alias-reference') {
  // Resolve from lock file (no network calls)
  const content = await env.resolveModuleImport(node.source);
  
  // Content is already verified by hash from cache
  // Security was checked during 'mlld install'
  return content;
}

// EXISTING: Handle path/URL imports
if (importPath.startsWith('https://') || importPath.startsWith('http://')) {
  // These still need security checks at runtime
  const security = env.getSecurityManager();
  if (security) {
    await security.checkImport(importPath);
  }
}
```

### 3. Add Path Security to File Operations (Day 2)

**File**: `interpreter/env/Environment.ts`

```typescript
// Update readFile() method:
async readFile(filePath: string): Promise<string> {
  // NEW: Security check
  const security = this.getSecurityManager();
  if (security) {
    await security.checkPath(filePath, 'read');
  }
  
  // Existing file reading code...
  return this.fileSystem.readFile(resolvedPath, 'utf-8');
}

// Update writeFile() method similarly
```

### 4. Implement Variable Taint Tracking (Day 2)

**File**: `interpreter/env/Environment.ts`

```typescript
// Add taint tracking to variables:
interface VariableWithTaint extends MlldVariable {
  taint?: TaintLevel;
}

class Environment {
  private variableTaints = new Map<string, TaintLevel>();
  
  setVariable(name: string, variable: MlldVariable, taint?: TaintLevel): void {
    // Existing variable setting code...
    
    if (taint) {
      this.variableTaints.set(name, taint);
    }
  }
  
  getVariableTaint(name: string): TaintLevel | undefined {
    return this.variableTaints.get(name) || 
           this.parent?.getVariableTaint(name);
  }
}
```

### 5. Track Command Output Taint (Day 3)

**File**: `interpreter/eval/run.ts`

```typescript
// After command execution:
const output = await env.executeCommand(command, undefined, executionContext);

// Mark output as tainted based on command
const security = env.getSecurityManager();
if (security) {
  const taint = security.getTaintForCommandOutput(command);
  
  // If assigning to a variable, track its taint
  if (directive.assignTo) {
    env.setVariableTaint(directive.assignTo, taint);
  }
}
```

### 6. Implement CLI Commands (Day 3-4)

**NOTE: New CLI commands per `_dev/HASH-CACHE-TODO.md`:**
- `mlld install @user/module` - Install module from registry
- `mlld add <url> --alias name` - Add URL with alias
- `mlld update [--force]` - Update modules respecting TTL
- `mlld ls [alias]` - List installed modules/aliases
- `mlld rm @user/module` - Remove module

Security integration happens during install:
- Advisories checked when installing
- Content verified by hash
- Approval prompts for new imports
- Lock file tracks approved content

**File**: `cli/commands/install.ts` (NEW)

```typescript
export async function installCommand(ref: string, options: InstallOptions) {
  // 1. Resolve module/URL to actual content location
  // 2. Check security advisories (if from registry)
  // 3. Show approval prompt with content preview
  // 4. Download and verify hash
  // 5. Store in cache
  // 6. Update lock file
  
  const security = SecurityManager.getInstance(process.cwd());
  if (ref.startsWith('@')) {
    // Registry module - check advisories
    const advisories = await security.checkAdvisories(ref);
    if (advisories.length > 0) {
      const approved = await security.promptInstallApproval(ref, advisories);
      if (!approved) {
        throw new Error('Installation cancelled due to security advisories');
      }
    }
  }
  
  // Continue with installation...
}
```

**File**: `cli/commands/security.ts`

```typescript
export async function securityCommand(args: string[]) {
  const [subcommand] = args;
  
  switch (subcommand) {
    case 'audit':
      return securityAudit();
    case 'show':
      return securityShow();
    default:
      console.log('Usage: mlld security <audit|show>');
  }
}

async function securityAudit() {
  // Find all .mld files
  const files = await glob('**/*.mld');
  const security = SecurityManager.getInstance(process.cwd());
  
  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    // Parse and analyze for security issues
    const issues = await security.auditFile(file, content);
    
    if (issues.length > 0) {
      console.log(`\n${file}:`);
      for (const issue of issues) {
        console.log(`  ${issue.severity}: ${issue.description}`);
      }
    }
  }
}
```

### 7. Add Security Hooks to Interpreter (Day 4)

**File**: `interpreter/core/interpreter.ts`

```typescript
// In evaluate() function:
export async function evaluate(
  nodes: MlldNode[],
  env: Environment
): Promise<EvalResult> {
  // Run pre-evaluation security hooks
  const security = env.getSecurityManager();
  if (security) {
    await security.runHooks('pre-evaluate', { nodes, env });
  }
  
  // ... existing evaluation code ...
  
  // Run post-evaluation hooks
  if (security) {
    await security.runHooks('post-evaluate', { result, env });
  }
}
```

### 8. Implement Policy Manager (Day 5)

**File**: `security/policy/PolicyManager.ts`

```typescript
export class PolicyManager {
  private globalPolicy: SecurityPolicy;
  private projectPolicy?: SecurityPolicy;
  
  constructor(projectPath: string) {
    // Load immutable global policy
    this.globalPolicy = this.loadGlobalPolicy();
    
    // Load project policy if exists
    const configPath = path.join(projectPath, 'mlld.config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      this.projectPolicy = config.security;
    }
  }
  
  getPolicy(): MergedPolicy {
    // Project policy can only make things MORE restrictive
    return this.mergeRestrictive(this.globalPolicy, this.projectPolicy);
  }
  
  private mergeRestrictive(global: SecurityPolicy, project?: SecurityPolicy): MergedPolicy {
    return {
      imports: {
        requireApproval: project?.imports?.requireApproval ?? global.imports.requireApproval,
        pinByDefault: project?.imports?.pinByDefault ?? global.imports.pinByDefault
      },
      commands: {
        preFlightCheck: project?.commands?.preFlightCheck ?? global.commands.preFlightCheck,
        blockLLMExecution: true // Always true, cannot be disabled
      },
      // ... merge other policies
    };
  }
}
```

### 9. Implement Audit Logger (Day 5)

**File**: `security/audit/AuditLogger.ts`

```typescript
export class AuditLogger {
  private logPath: string;
  
  constructor(projectPath: string) {
    this.logPath = path.join(projectPath, '.mlld', 'audit', 
      `${new Date().toISOString().split('T')[0]}.log`);
  }
  
  async log(event: SecurityEvent): Promise<void> {
    const entry = {
      timestamp: new Date().toISOString(),
      ...event
    };
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    
    // Append to log file
    await fs.appendFile(
      this.logPath,
      JSON.stringify(entry) + '\n'
    );
  }
  
  async getEvents(filter?: EventFilter): Promise<SecurityEvent[]> {
    // Read and parse log file
    const content = await fs.readFile(this.logPath, 'utf8');
    const events = content.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    // Apply filter if provided
    if (filter) {
      return events.filter(e => this.matchesFilter(e, filter));
    }
    
    return events;
  }
}
```

### 10. Integration Tests (Day 6)

**File**: `tests/security-integration.test.ts`

```typescript
describe('Security Integration', () => {
  it('should block dangerous commands', async () => {
    const mld = `@run [rm -rf /]`;
    await expect(interpret(mld)).rejects.toThrow('Command blocked');
  });
  
  it('should block LLM output execution', async () => {
    const mld = `
      @text cmd = "rm -rf /"
      @run [@cmd]
    `;
    // Mock the taint tracker to mark cmd as LLM_OUTPUT
    await expect(interpret(mld)).rejects.toThrow('LLM output execution blocked');
  });
  
  it('should resolve registry imports', async () => {
    const mld = `@import { tool } from "mlld://registry/test/module"`;
    // Mock registry response
    const result = await interpret(mld);
    expect(result).toContain('imported successfully');
  });
  
  it('should block access to SSH keys', async () => {
    const mld = `@text key = [~/.ssh/id_rsa]`;
    await expect(interpret(mld)).rejects.toThrow('Access denied to protected path');
  });
});
```

## Testing Plan

### Unit Tests (Existing)
- ✅ Each security component has unit tests
- ✅ Registry resolver tests
- ✅ Command analyzer tests

### Integration Tests (Needed)
1. Command execution with security checks
2. Import resolution through registry
3. Path access validation
4. Taint propagation through operations
5. CLI command functionality
6. Audit logging

### End-to-End Tests (Needed)
1. Full security flow from import to execution
2. Attack scenario tests
3. Performance impact measurement

## Success Criteria

1. **Command Security**: `@run [rm -rf /]` is blocked
2. **LLM Protection**: LLM output cannot be executed
3. **Path Protection**: SSH keys cannot be read
4. **Registry Works**: `mlld://registry/` URLs resolve
5. **Advisories Show**: Security warnings appear
6. **CLI Commands**: `mlld registry search` works
7. **Audit Trail**: Security events are logged

## Risk Mitigation

1. **Feature Flag**: Add `MLLD_SECURITY_ENABLED` env var for testing
2. **Gradual Rollout**: Start with warnings before blocking
3. **Escape Hatch**: `--no-security` flag for development (with big warnings)
4. **Performance**: Cache security decisions where safe

## Timeline

- **Days 1-2**: Core integration (commands, imports, paths)
- **Days 3-4**: CLI commands and taint tracking
- **Days 5**: Policy manager and audit logger
- **Day 6**: Testing and polish

This plan focuses on the minimal integration needed to make security functional. Once these connections are made, the existing security components will spring to life and provide the protection designed in the architecture.

## 🚧 REMAINING WORK SUMMARY

### High Priority (Security Critical)
1. **Registry Import Resolution** (Task #2) - Make mlld:// URLs work
2. **Path Security** (Task #3) - Block access to SSH keys, credentials
3. **Variable Taint Tracking** (Task #4) - Track untrusted data through variables
4. **Command Output Taint** (Task #5) - Mark command outputs appropriately

### Medium Priority (Feature Complete)
5. **PolicyManager** (Task #8) - User-configurable security rules
6. **AuditLogger** (Task #9) - Security event logging
7. **Approval Prompts** - Interactive security decisions
8. **CLI Commands** (Task #6) - Registry and security management

### Low Priority (Polish)
9. **Security Hooks** (Task #7) - Pre/post evaluation hooks
10. **Integration Tests** (Task #10) - Comprehensive test suite

### Key Files to Modify
- `interpreter/eval/import.ts` - Add registry resolution
- `interpreter/env/Environment.ts` - Add path checks to readFile/writeFile
- `security/policy/PolicyManager.ts` - Create this file
- `security/audit/AuditLogger.ts` - Create this file
- `cli/commands/registry.ts` - Create registry CLI commands
- `cli/commands/security.ts` - Create security CLI commands