# Workstream: Security Integration

## Overview
Wire up the existing SecurityManager to the interpreter execution flow. Components exist but aren't called during command execution, path access, or imports.

## Current State
- SecurityManager exists with all subsystems ✅
- Environment creates SecurityManager ✅
- But doesn't call security checks ❌
- No taint tracking during execution ❌

## Implementation Plan

### Phase 1: Command Execution Integration (Day 1)

```typescript
// In Environment.ts - update executeCommand
async executeCommand(
  command: string,
  options?: CommandExecutionOptions,
  context?: CommandExecutionContext
): Promise<string> {
  // NEW: Security check before execution
  if (this.securityManager) {
    const decision = await this.securityManager.checkCommand(command, {
      file: context?.filePath,
      line: context?.sourceLocation?.start.line,
      directive: context?.directiveType,
      trust: context?.trust
    });
    
    if (decision.blocked) {
      throw new MlldCommandExecutionError(
        `Security: ${decision.reason}`,
        command,
        1,
        '',
        decision.reason
      );
    }
    
    if (decision.requiresApproval && !options?.approved) {
      const approved = await this.promptCommandApproval(command, decision);
      if (!approved) {
        throw new MlldCommandExecutionError('Command execution cancelled');
      }
    }
  }
  
  // Existing execution logic...
  const result = await this.executeCommandImpl(command, options);
  
  // NEW: Track output taint
  if (this.securityManager) {
    this.securityManager.trackTaint(result, TaintSource.COMMAND_OUTPUT);
  }
  
  return result;
}
```

### Phase 2: Path Access Integration (Day 2)

```typescript
// In Environment.ts - update file operations
async readFile(path: string): Promise<string> {
  const resolvedPath = this.resolvePath(path);
  
  // NEW: Security check for path access
  if (this.securityManager) {
    const allowed = await this.securityManager.checkPath(resolvedPath, 'read');
    if (!allowed) {
      throw new MlldFileSystemError(`Security: Read access denied for ${path}`);
    }
  }
  
  const content = await this.fileSystem.readFile(resolvedPath);
  
  // NEW: Track file content taint
  if (this.securityManager) {
    this.securityManager.trackTaint(content, TaintSource.FILE_SYSTEM);
  }
  
  return content;
}

async writeFile(path: string, content: string): Promise<void> {
  const resolvedPath = this.resolvePath(path);
  
  // NEW: Security check for write access
  if (this.securityManager) {
    const allowed = await this.securityManager.checkPath(resolvedPath, 'write');
    if (!allowed) {
      throw new MlldFileSystemError(`Security: Write access denied for ${path}`);
    }
  }
  
  await this.fileSystem.writeFile(resolvedPath, content);
}
```

### Phase 3: Import Security Integration (Day 3)

```typescript
// In Environment.ts - update fetchURL
async fetchURL(url: string, forImport = false): Promise<string> {
  // NEW: Use SecurityManager for import resolution
  if (forImport && this.securityManager) {
    const { resolvedURL, taint, advisories } = await this.securityManager.resolveImport(url);
    
    // Check advisories
    if (advisories.length > 0) {
      const proceed = await this.securityManager.approveImport(url, '', advisories);
      if (!proceed) {
        throw new MlldImportError(`Import blocked due to security advisories`);
      }
    }
    
    url = resolvedURL; // Use resolved URL
  }
  
  // Existing URL fetch logic...
  const content = await this.fetchURLImpl(url);
  
  // NEW: Import approval with content
  if (forImport && this.securityManager) {
    const approved = await this.securityManager.approveImport(url, content, []);
    if (!approved) {
      throw new MlldImportError(`Import not approved by user`);
    }
  }
  
  // NEW: Track URL content taint
  if (this.securityManager) {
    this.securityManager.trackTaint(content, TaintSource.NETWORK);
  }
  
  return content;
}
```

### Phase 4: Taint Propagation (Day 4)

```typescript
// Track taint through variable assignments
class Environment {
  setVariable(name: string, variable: MlldVariable): void {
    // Check for tainted values
    if (this.securityManager && typeof variable.value === 'string') {
      const taint = this.securityManager.getTaint(variable.value);
      if (taint) {
        // Propagate taint to new variable
        this.securityManager.trackTaint(variable.value, taint.source);
      }
    }
    
    super.setVariable(name, variable);
  }
}

// In interpolation
export async function interpolate(nodes: ContentNode[], env: Environment): Promise<string> {
  let result = '';
  let hasTaintedContent = false;
  
  for (const node of nodes) {
    const value = await evaluateNode(node, env);
    result += value;
    
    // Check if this value is tainted
    if (env.securityManager) {
      const taint = env.securityManager.getTaint(value);
      if (taint) hasTaintedContent = true;
    }
  }
  
  // Mark result as tainted if any input was tainted
  if (hasTaintedContent && env.securityManager) {
    env.securityManager.trackTaint(result, TaintSource.MIXED);
  }
  
  return result;
}
```

### Phase 5: Audit Logging (Day 5)

```typescript
// Implement AuditLogger
export class AuditLogger {
  private logPath: string;
  private logStream?: fs.WriteStream;
  
  constructor(logPath: string) {
    this.logPath = logPath;
  }
  
  async log(event: AuditEvent): Promise<void> {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      event: event.type,
      details: event,
      user: process.env.USER || 'unknown',
      pid: process.pid
    };
    
    // Ensure log directory exists
    await fs.promises.mkdir(path.dirname(this.logPath), { recursive: true });
    
    // Append to log file
    await fs.promises.appendFile(
      this.logPath,
      JSON.stringify(entry) + '\n',
      'utf8'
    );
  }
  
  async rotate(retentionDays: number): Promise<void> {
    // Implement log rotation based on retention policy
  }
}

// Wire to SecurityManager
class SecurityManager {
  private auditLogger: AuditLogger;
  
  constructor(projectPath: string) {
    const auditPath = path.join(os.homedir(), '.mlld', 'audit.log');
    this.auditLogger = new AuditLogger(auditPath);
  }
}
```

## Testing

1. Command execution with security checks
2. Path access validation 
3. Import approval flow
4. Taint propagation through variables
5. Audit log generation

## Success Criteria

- [ ] All commands go through security checks
- [ ] Path access is validated
- [ ] Imports trigger approval flow
- [ ] Taint is tracked through execution
- [ ] Audit log captures security events