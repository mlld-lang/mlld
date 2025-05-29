# Security & Registry Integration Plan

## Overview

This document outlines how the Registry Design (from REGISTRY-DESIGN.md) integrates with our Security MVP, creating a cohesive system for secure import management.

## Key Integration Points

### 1. Registry as a Security Layer

The registry isn't just about sharing - it's a critical security component:

- **Content Addressing**: SHA256 hashes prevent tampering
- **Lock Files**: Immutable import snapshots prevent supply chain attacks
- **Advisory System**: Community-driven vulnerability reporting
- **Approval Flow**: Every import requires explicit consent

### 2. Security Module Extensions Needed

#### 2.1 Registry Client in Security Module
```
security/
├── registry/                  # NEW: Registry integration
│   ├── RegistryClient.ts     # Main registry client
│   ├── LockFile.ts           # Lock file management
│   ├── AdvisoryChecker.ts    # Security advisory checks
│   └── index.ts
```

#### 2.2 Enhanced Import Security
- Extend `ImportApproval` to understand registry URLs (`mlld://`)
- Add registry-specific validation rules
- Integrate with lock file mechanism

#### 2.3 Taint Tracking for Registry Imports
```typescript
enum TaintLevel {
  TRUSTED = 'trusted',
  REGISTRY_VERIFIED = 'registry_verified',    // NEW
  REGISTRY_COMMUNITY = 'registry_community',  // NEW
  GIST = 'gist',                             // NEW
  // ... existing levels
}
```

### 3. Security Flow for Registry Imports

```
User writes: @import { foo } from "mlld://gist/user/id"
                    ↓
            SecurityManager
                    ↓
         ┌─────────┴──────────┐
         │                    │
    PathSecurity        RegistryClient
    (validates)         (resolves import)
         │                    │
         └─────────┬──────────┘
                   ↓
            ImportApproval
            (user consent)
                   ↓
           AdvisoryChecker
         (security warnings)
                   ↓
            LockFile.add()
          (immutable record)
                   ↓
          ImmutableCache
         (store approved)
```

### 4. Lock File Security Properties

The lock file becomes a security artifact:

```json
{
  "version": "1.0.0",
  "imports": {
    "mlld://gist/user/abc123": {
      "resolved": "https://gist.githubusercontent.com/...",
      "integrity": "sha256:...",
      "taintLevel": "gist",              // Track trust level
      "securityAdvisories": [],           // Known issues
      "approvedCommands": ["echo", "ls"], // What it can do
      "riskScore": "low",                 // Calculated risk
      "approvedAt": "2024-01-25T10:00:00Z",
      "approvedBy": "user@example.com"
    }
  }
}
```

### 5. Advisory Integration

#### 5.1 Advisory Checking
- Before import: Check if content hash has advisories
- After import: Monitor for new advisories
- On execution: Warn if using affected imports

#### 5.2 Advisory Format Extension
```typescript
interface SecurityAdvisory {
  id: string;
  module: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'command-injection' | 'data-exposure' | 'llm-injection'; // NEW
  affectedVersions: string[];
  fixedVersions: string[];
  cwe: string[];  // Common Weakness Enumeration
}
```

### 6. Command Security Integration

When executing commands from registry imports:

```typescript
// In CommandAnalyzer
async analyze(command: string, context: CommandContext) {
  // Check if command comes from a registry import
  if (context.source?.startsWith('mlld://')) {
    const importMeta = await this.lockFile.getImport(context.source);
    
    // Higher scrutiny for community imports
    if (importMeta.taintLevel === 'gist') {
      risks.push({
        type: 'UNTRUSTED_SOURCE',
        severity: 'HIGH',
        description: 'Command from community import'
      });
    }
    
    // Check if import has advisories
    if (importMeta.securityAdvisories?.length > 0) {
      risks.push({
        type: 'KNOWN_VULNERABLE',
        severity: 'CRITICAL',
        description: 'Import has security advisories'
      });
    }
  }
}
```

### 7. CLI Commands for Security + Registry

```bash
# Security-focused registry commands
mlld security audit          # Check all imports for advisories
mlld security verify         # Verify integrity of all imports
mlld security lock-status    # Show lock file security info

# Registry commands with security
mlld registry import <url> --security-scan   # Pre-import scan
mlld registry trust <publisher>              # Trust a publisher
mlld registry advisories                     # List all advisories
```

### 8. Implementation Phases

#### Phase 1: Lock File Foundation (Days 1-2)
- [ ] Create `security/registry/` module structure
- [ ] Implement basic `LockFile` class
- [ ] Integrate with existing `ImportApproval`
- [ ] Add integrity checking to imports

#### Phase 2: Registry Client (Days 3-4)
- [ ] Implement `RegistryClient` with gist support
- [ ] Add `mlld://` URL parsing
- [ ] Create registry-specific taint levels
- [ ] Integrate with `ImmutableCache`

#### Phase 3: Advisory System (Days 5-6)
- [ ] Design advisory database schema
- [ ] Implement `AdvisoryChecker`
- [ ] Add advisory warnings to import flow
- [ ] Create `mlld audit` command

#### Phase 4: Enhanced Security (Days 7-8)
- [ ] Add pre-import security scanning
- [ ] Implement publisher trust levels
- [ ] Create security dashboard output
- [ ] Add telemetry for community protection

### 9. Security Benefits

1. **Immutable Imports**: Can't be changed after approval
2. **Supply Chain Security**: Lock files prevent updates without review
3. **Community Protection**: Advisories protect all users
4. **Audit Trail**: Complete record of what was approved when
5. **Risk Scoring**: Automated assessment of import safety

### 10. Example: Secure Import Flow

```meld
# User's script
@import { analyzer } from "mlld://gist/alice/abc123"

# Terminal output:
⚠️  New import detected: mlld://gist/alice/abc123

Fetching content...
✓ Content hash: sha256:e3b0c44298fc...

Security Analysis:
- Taint Level: GIST (Community)
- Commands detected: 2
  - echo (safe)
  - curl (network access)
- No known advisories

[Show content preview]

This import will be locked to revision: b20e54d6
Future updates will require re-approval.

Approve import? [y/N/details]: 
```

### 11. Future Enhancements

1. **Signed Imports**: GPG signatures for verified publishers
2. **Sandboxed Execution**: Run registry imports in containers
3. **Static Analysis**: Pre-import code analysis
4. **Reputation System**: Community ratings for imports
5. **Dependency Graph**: Track transitive import risks

## Conclusion

The registry design and security architecture are complementary:
- Registry provides distribution and versioning
- Security provides validation and protection
- Together they enable safe code sharing

The lock file becomes the bridge between them, recording both what was imported (registry) and why it was trusted (security).