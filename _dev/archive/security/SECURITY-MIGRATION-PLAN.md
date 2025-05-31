# Security Module Migration Plan

## Overview

Consolidate all security-related code from various locations into a unified `security/` module.

## Migration Steps

### Step 1: Create Full Directory Structure

```bash
security/
├── import/                    # Import security (from core/security/)
│   ├── ImportApproval.ts     # Move from core/security/
│   ├── GistTransformer.ts    # Move from core/security/
│   ├── ImportValidator.ts    # New: Additional validation
│   └── index.ts
│
├── cache/                     # Security caching
│   ├── ImmutableCache.ts     # Move from core/security/
│   ├── PolicyCache.ts        # New: Cache policies
│   └── index.ts
│
├── url/                       # URL security (extract from Environment)
│   ├── URLValidator.ts       # Extract from Environment.ts
│   ├── URLFetcher.ts         # Secure URL fetching
│   ├── URLConfig.ts          # URL configuration
│   └── index.ts
│
├── path/                      # Path security
│   ├── PathValidator.ts      # Enhanced from PathService
│   ├── PathSanitizer.ts     # Path traversal prevention
│   └── index.ts
│
├── command/                   # Command security (already started)
│   ├── analyzer/
│   │   └── CommandAnalyzer.ts
│   ├── executor/
│   │   └── CommandExecutor.ts # Extract from Environment
│   └── index.ts
│
├── policy/                    # Policy management
│   ├── PolicyManager.ts      # New
│   ├── patterns.ts           # IMMUTABLE_SECURITY_PATTERNS
│   └── index.ts
│
├── config/                    # Security configuration
│   ├── types.ts              # Move security types from core/config/types.ts
│   ├── loader.ts             # Security config loading
│   └── index.ts
│
├── tests/                     # Consolidated tests
│   ├── import.test.ts        # From core/security/security.test.ts
│   ├── url.test.ts           # From interpreter/url-support.test.ts
│   ├── command.test.ts       # New tests
│   └── fixtures/
│
└── index.ts                   # Main exports
```

### Step 2: File Migrations

#### 2.1 Move existing security files

```bash
# From core/security/ to security/import/
mv core/security/ImportApproval.ts security/import/
mv core/security/GistTransformer.ts security/import/

# From core/security/ to security/cache/
mv core/security/ImmutableCache.ts security/cache/

# Move tests
mv core/security/security.test.ts security/tests/import.test.ts
```

#### 2.2 Extract URL security from Environment.ts

Create `security/url/URLValidator.ts`:
```typescript
// Extract from Environment.ts lines 63-69
export interface URLSecurityConfig {
  enabled: boolean;
  allowedProtocols: string[];
  allowedDomains: string[];
  blockedDomains: string[];
  timeout: number;
  maxResponseSize: number;
  cache: URLCacheConfig;
}

export class URLValidator {
  // Move URL validation logic here
}
```

#### 2.3 Extract command execution security

Create `security/command/executor/CommandExecutor.ts`:
```typescript
// Extract executeCommand logic from Environment.ts
export class CommandExecutor {
  async execute(command: string, options: CommandOptions): Promise<string> {
    // Move command execution with security checks
  }
}
```

### Step 3: Update Import Paths

#### 3.1 Update type imports

```typescript
// Before (in various files)
import { ImportApproval } from '@core/security/ImportApproval';

// After
import { ImportApproval } from '@security/import';
```

#### 3.2 Update Environment.ts

```typescript
// Before
import { ImportApproval } from '@core/security/ImportApproval';
import { ImmutableCache } from '@core/security/ImmutableCache';

// After
import { SecurityManager } from '@security';
import { ImportApproval } from '@security/import';
import { ImmutableCache } from '@security/cache';
import { URLValidator } from '@security/url';
import { CommandExecutor } from '@security/command';
```

### Step 4: Integration Points

#### 4.1 Environment.ts refactoring

```typescript
export class Environment {
  private security: SecurityManager;
  
  constructor() {
    this.security = SecurityManager.getInstance();
    // Remove direct instantiation of ImportApproval, ImmutableCache
    // Use security manager instead
  }
  
  // Delegate to security modules
  async executeCommand(cmd: string): Promise<string> {
    return this.security.executeCommand(cmd, this.getContext());
  }
  
  async fetchURL(url: string): Promise<string> {
    return this.security.fetchURL(url, this.getContext());
  }
}
```

#### 4.2 Update tsconfig paths

```json
{
  "compilerOptions": {
    "paths": {
      "@security": ["security/index.ts"],
      "@security/*": ["security/*"]
    }
  }
}
```

### Step 5: Backward Compatibility

Create compatibility exports in `core/security/index.ts`:
```typescript
// Temporary backward compatibility
export { ImportApproval } from '@security/import';
export { ImmutableCache } from '@security/cache';
export { GistTransformer } from '@security/import';

console.warn('Deprecated: Import security modules from @security instead of @core/security');
```

### Step 6: Testing

1. Run existing tests to ensure nothing breaks
2. Add integration tests for SecurityManager
3. Test all import path updates
4. Verify backward compatibility

## Benefits

1. **Centralized Security**: All security logic in one place
2. **Better Organization**: Clear separation of concerns
3. **Easier Auditing**: Security code is easier to review
4. **Extensibility**: Easy to add new security features
5. **Testability**: Isolated security modules are easier to test

## Timeline

- **Day 1**: Create directory structure, move existing files
- **Day 2**: Extract embedded security logic
- **Day 3**: Update import paths, integrate SecurityManager
- **Day 4**: Testing and documentation

## Risks & Mitigations

1. **Risk**: Breaking existing functionality
   - **Mitigation**: Keep backward compatibility layer temporarily

2. **Risk**: Missing security checks during refactor
   - **Mitigation**: Comprehensive test suite before/after

3. **Risk**: Performance impact from additional abstraction
   - **Mitigation**: Profile and optimize hot paths