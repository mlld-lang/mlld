# Mlld Security Architecture

## Overview

The mlld security system is designed to protect users from malicious code execution while maintaining the flexibility needed for legitimate use cases. The architecture follows defense-in-depth principles with multiple layers of protection.

## Architecture Components

### 1. Security Module Structure

```
security/
├── command/           # Command execution security
│   ├── analyzer/      # Static analysis of commands
│   └── executor/      # Safe command execution
├── path/             # Path access control
│   └── PathValidator.ts
├── import/           # Import security
│   ├── ImportApproval.ts
│   └── GistTransformer.ts
├── cache/            # Immutable caching
│   └── ImmutableCache.ts
├── url/              # URL validation
│   └── URLValidator.ts
├── registry/         # Registry and advisories
│   ├── RegistryResolver.ts
│   └── AdvisoryChecker.ts
├── taint/            # Taint tracking
│   └── TaintTracker.ts
├── policy/           # Security policies
│   └── patterns.ts
└── SecurityManager.ts # Central coordinator
```

### 2. Core Security Concepts

#### 2.1 Taint Tracking

Every value in mlld carries a "taint level" indicating its trust level:

```typescript
enum TaintLevel {
  TRUSTED = 'trusted',                  // Literal strings in .mld files
  REGISTRY_SAFE = 'registry_safe',      // Registry import with no advisories
  REGISTRY_WARNING = 'registry_warning', // Registry import with advisories
  GIST_DIRECT = 'gist_direct',         // Direct gist import
  USER_INPUT = 'user_input',           // From user prompts
  FILE_SYSTEM = 'file_system',         // From local files
  NETWORK = 'network',                 // From URLs
  LLM_OUTPUT = 'llm_output',           // From LLM responses - HIGHEST RISK
  COMMAND_OUTPUT = 'command_output',   // From command execution
  MIXED = 'mixed'                      // Combined sources
}
```

The taint system prevents dangerous operations:
- `LLM_OUTPUT` cannot be executed as commands
- `REGISTRY_WARNING` triggers extra warnings
- Taint propagates through operations (always uses highest risk level)

#### 2.2 Immutable Security Patterns

Located in `security/policy/patterns.ts`, these patterns CANNOT be modified by any mlld script:

```typescript
const IMMUTABLE_SECURITY_PATTERNS = {
  protectedReadPaths: [
    '~/.ssh/**',      // SSH keys
    '~/.aws/**',      // AWS credentials
    '~/.gnupg/**',    // GPG keys
    // ... more sensitive paths
  ],
  protectedWritePaths: [
    '~/.mlld/**',     // Security config itself!
    '/etc/**',        // System config
    '/System/**',     // macOS system
    // ... more system paths
  ],
  blockedCommands: [
    'rm -rf /',       // Delete root
    ':(){ :|:& };:',  // Fork bomb
    // ... more dangerous commands
  ]
};
```

#### 2.3 Command Analysis

The `CommandAnalyzer` uses OWASP patterns to detect:

1. **Shell Injection**: `;`, `&&`, `||`, `|`, `$(`, backticks
2. **Dangerous Commands**: Categorized by risk level
3. **Data Exfiltration**: Patterns like `cat ~/.ssh/id_rsa | curl`
4. **LLM Commands**: Detects AI tool invocations

```typescript
// Example risk assessment
{
  command: "rm -rf /tmp/cache",
  risks: [
    { type: 'DANGEROUS_COMMAND', severity: 'HIGH', description: 'rm is potentially dangerous' }
  ],
  requiresApproval: true
}
```

### 3. Security Flow

#### 3.1 Import Security Flow

```
User: @import { tool } from "mlld://registry/utils/scanner"
                    ↓
         SecurityManager.resolveImport()
                    ↓
         RegistryResolver.resolve()
         → Fetch registry.json (cached)
         → Resolve to mlld://gist/user/id
                    ↓
         AdvisoryChecker.check()
         → Check for security advisories
                    ↓
         ImportApproval.prompt()
         → Show preview + warnings
         → Get user consent
                    ↓
         TaintTracker.mark()
         → Mark as REGISTRY_SAFE or WARNING
                    ↓
         ImmutableCache.store()
         → Cache by content hash
```

#### 3.2 Command Execution Flow

```
User: @run [(command)]
           ↓
    Environment.executeCommand()
           ↓
    SecurityManager.checkCommand()
           ↓
    CommandAnalyzer.analyze()
    → Check injection patterns
    → Assess risk level
    → Check taint level
           ↓
    [If risky or tainted]
    → Prompt for approval
    → Audit log
           ↓
    CommandExecutor.execute()
    → Safe execution
    → Output management
```

#### 3.3 Path Access Flow

```
User: @text content = [~/.ssh/id_rsa]
                    ↓
         Environment.readFile()
                    ↓
         SecurityManager.checkPath()
                    ↓
         PathValidator.canRead()
         → Check against patterns
                    ↓
         [BLOCKED]
         throw MlldFileSystemError
```

### 4. Registry Integration

#### 4.1 Registry Resolution

The registry acts as "DNS for Gists":

```
mlld://registry/prompts/code-review
            ↓
    registry.json lookup
            ↓
mlld://gist/anthropics/abc123
```

#### 4.2 Advisory System

Advisories are security warnings for specific modules:

```typescript
interface Advisory {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affects: string[];      // Module names
  gists: string[];       // Affected gist IDs
  type: 'command-injection' | 'data-exposure' | ...;
  description: string;
  recommendation: string;
}
```

### 5. Security Hooks

The system provides hooks for security checks at various points:

```typescript
interface SecurityHook {
  event: 'pre-command' | 'post-command' | 'pre-import' | ...;
  execute(data: any): Promise<void>;
}
```

### 6. Configuration

Security configuration is layered:

1. **Immutable Global** (cannot be changed by scripts)
2. **Project Config** (`mlld.config.json`)
3. **User Preferences** (future)

Example project config:
```json
{
  "security": {
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

### 7. Implementation Details

#### 7.1 Environment Integration

The `Environment` class integrates security:

```typescript
class Environment {
  private securityManager?: SecurityManager;
  
  async executeCommand(cmd: string): Promise<string> {
    // Security check before execution
    const decision = await this.securityManager.checkCommand(cmd);
    if (decision.blocked) throw new SecurityError(decision.reason);
    // ... execute
  }
  
  async readFile(path: string): Promise<string> {
    // Path security check
    await this.securityManager.checkPath(path, 'read');
    // ... read file
  }
}
```

#### 7.2 Caching Strategy

- **Registry Data**: Cached for 1 hour
- **Advisories**: Cached for 1 hour
- **Imports**: Cached forever by content hash
- **Security Decisions**: Not cached (always fresh)

#### 7.3 Error Handling

Security errors are distinct from other errors:

```typescript
class SecurityError extends MlldError {
  constructor(
    message: string,
    public code: 'PATH_BLOCKED' | 'COMMAND_BLOCKED' | ...,
    public severity: 'warning' | 'error' | 'critical'
  ) {
    super(message);
  }
}
```

### 8. Security Boundaries

#### What We Secure:
- Command execution (all `@run` directives)
- File system access (reads and writes)
- Import verification (content integrity)
- LLM output execution (complete blocking)
- Network requests (URL validation)

#### What We Don't Secure (Yet):
- Memory/CPU limits
- Network traffic inspection
- Sandboxed execution environments
- Output content filtering

### 9. Testing Strategy

Security testing includes:

1. **Unit Tests**: Each security component
2. **Integration Tests**: Security flow scenarios
3. **Attack Tests**: Known attack patterns
4. **Regression Tests**: Previously found issues

Example test:
```typescript
it('should block LLM command execution', async () => {
  const env = new Environment();
  const llmOutput = 'rm -rf /';
  env.trackTaint('cmd', llmOutput, TaintLevel.LLM_OUTPUT);
  
  await expect(
    env.executeCommand('@cmd')
  ).rejects.toThrow('LLM output execution blocked');
});
```

### 10. Future Enhancements

1. **Sandboxing**: Docker/Firecracker containers
2. **Capability System**: Fine-grained permissions
3. **Signed Modules**: GPG signatures for trusted code
4. **Audit Streaming**: Real-time security events
5. **Machine Learning**: Anomaly detection for commands

### 11. Security Principles

1. **Fail Secure**: When in doubt, block
2. **Defense in Depth**: Multiple layers of protection
3. **Least Privilege**: Minimal permissions by default
4. **Informed Consent**: Users understand risks
5. **Audit Everything**: Complete security trail

### 12. Performance Considerations

- Pattern matching is pre-compiled (Minimatch)
- Caching reduces repeated validations
- Security checks add ~5-10ms per operation
- Async operations for non-blocking checks

## Conclusion

The mlld security architecture provides comprehensive protection while maintaining usability. The layered approach ensures that even if one security measure fails, others provide backup protection. The system is designed to be extensible, allowing for additional security features as the platform evolves.