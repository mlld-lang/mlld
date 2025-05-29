# Security Integration TODO

## Overview

The security architecture is built but not connected. This document outlines the specific integration tasks needed to make security features functional.

## Critical Path Integration Tasks

### 1. Hook Security into Command Execution (Day 1)

**File**: `interpreter/eval/run.ts`

```typescript
// Add to evaluateRun() before command execution:
import { SecurityManager } from '@security';

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

**File**: `interpreter/eval/import.ts`

```typescript
// Update the mlld:// handling section:
if (importPath.startsWith('mlld://')) {
  const security = env.getSecurityManager();
  if (security) {
    // Resolve through security (handles registry + advisories)
    const { resolvedURL, taint, advisories } = await security.resolveImport(importPath);
    
    // Mark the import with its taint level
    env.markImportTaint(resolvedURL, taint);
    
    resolvedPath = resolvedURL;
  } else {
    // Fallback to existing registry resolver
    const registryResolver = env.getRegistryResolver();
    if (registryResolver) {
      resolvedPath = await registryResolver.resolve(importPath);
    }
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

**File**: `cli/commands/registry.ts`

```typescript
export async function registryCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  
  switch (subcommand) {
    case 'search':
      return registrySearch(rest[0]);
    case 'info':
      return registryInfo(rest[0]);
    case 'audit':
      return registryAudit();
    default:
      console.log('Usage: mlld registry <search|info|audit>');
  }
}

async function registrySearch(query: string) {
  const security = SecurityManager.getInstance(process.cwd());
  const resolver = security.getRegistryResolver();
  const results = await resolver.searchModules(query);
  
  console.log(`Found ${results.length} modules:\n`);
  for (const [name, module] of results) {
    console.log(`${name} - ${module.description}`);
    console.log(`  Author: ${module.author}`);
    console.log(`  Tags: ${module.tags.join(', ')}\n`);
  }
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