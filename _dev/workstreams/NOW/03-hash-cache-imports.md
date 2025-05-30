# Hash-Cache Import System Implementation

**Status**: Not Started  
**Priority**: P0 - New module system  
**Estimated Time**: 3-4 days  
**Dependencies**: Grammar updates (for @user/module syntax)

## Objective

Implement the new content-addressed module system that replaces the old mlld:// URL approach with npm-style @user/module imports.

## Design Overview

### Import Flow
1. User writes: `@import { x } from @user/module`
2. Interpreter checks local hash cache
3. If not cached, fetch from registry (gist)
4. Hash the content (SHA-256)
5. Store in cache by hash
6. Update lock file with hash
7. Future imports use cached version

### Storage Structure
```
~/.mlld/
├── cache/
│   ├── sha256/
│   │   ├── f8h4.../   # Short hash directories
│   │   │   ├── content.mld
│   │   │   └── metadata.json
│   │   └── g23a.../
│   └── index.json     # Maps module@version to hash
└── registry/
    └── modules.json   # Local registry cache
```

## Core Components to Build

### 1. Hash Utilities (`/core/registry/utils/`)
```typescript
// hash.ts
export class HashUtils {
  static async hashContent(content: string): Promise<string> {
    // SHA-256 hash of content
  }
  
  static getShortHash(fullHash: string, minLength = 4): string {
    // Return shortest unique prefix
  }
  
  static expandHash(shortHash: string, hashes: string[]): string | null {
    // Find full hash from short hash
  }
}
```

### 2. Module Cache (`/core/registry/ModuleCache.ts`)
```typescript
export class ModuleCache {
  constructor(private cacheDir: string) {}
  
  async get(moduleId: string, hash?: string): Promise<ModuleContent | null> {
    // Check if module@hash exists in cache
  }
  
  async store(moduleId: string, content: string): Promise<string> {
    // Store content and return hash
  }
  
  async list(): Promise<CachedModule[]> {
    // List all cached modules
  }
}
```

### 3. Registry Client (`/core/registry/RegistryClient.ts`) 
```typescript
export class RegistryClient {
  async resolve(moduleId: string): Promise<ModuleInfo> {
    // Resolve @user/module to gist URL
    // Check DNS TXT record: user-module.registry.mlld.ai
  }
  
  async fetch(moduleInfo: ModuleInfo): Promise<string> {
    // Fetch content from gist
  }
  
  async search(query: string): Promise<ModuleInfo[]> {
    // Search registry (future)
  }
}
```

### 4. Module Resolver (`/core/registry/ModuleResolver.ts`)
```typescript
export class ModuleResolver {
  constructor(
    private cache: ModuleCache,
    private client: RegistryClient,
    private lockFile: LockFile
  ) {}
  
  async resolve(moduleRef: string, options?: SecurityOptions): Promise<string> {
    // 1. Parse @user/module@hash
    // 2. Check lock file for pinned version
    // 3. Check cache
    // 4. Fetch from registry if needed
    // 5. Validate hash matches
    // 6. Update lock file
    // Return local file path
  }
}
```

### 5. Lock File Updates (`/core/registry/LockFile.ts`)
```typescript
interface LockEntry {
  resolved: string;      // Full hash
  integrity: string;     // sha256-base64
  source: string;        // Gist URL
  fetchedAt: string;     // ISO timestamp
  ttl?: string;          // From TTL option
  trust?: string;        // From trust option
}

export class LockFile {
  async addModule(moduleId: string, entry: LockEntry): Promise<void> {
    // Add/update module in lock file
  }
  
  async getModule(moduleId: string): Promise<LockEntry | null> {
    // Get module from lock file
  }
}
```

## Grammar Integration

### Update Import Grammar (`grammar/directives/import.peggy`)
```peggy
ImportDirective = "@import" _ ImportTargets _ "from" _ ImportSource

ImportSource = ModuleReference SecurityOptions? / PathExpression SecurityOptions?

ModuleReference = "@" ModuleIdentifier
ModuleIdentifier = ModuleName ("@" ShortHash)?
ModuleName = UserName "/" PackageName
UserName = [a-z][a-z0-9-]*
PackageName = [a-z][a-z0-9-]*
ShortHash = [a-f0-9]{4,}
```

### AST Node Types
```typescript
interface ModuleReference {
  type: 'ModuleReference';
  user: string;
  name: string;
  version?: string;  // Short hash
  security?: SecurityOptions;
}
```

## Interpreter Integration

### Update Import Evaluator (`interpreter/eval/import.ts`)
```typescript
async function evaluateImport(node: ImportDirective, env: Environment) {
  if (node.source.type === 'ModuleReference') {
    // New module import logic
    const moduleRef = `@${node.source.user}/${node.source.name}`;
    const version = node.source.version;
    
    // Resolve to local file
    const localPath = await env.moduleResolver.resolve(moduleRef, {
      version,
      ttl: node.source.security?.ttl,
      trust: node.source.security?.trust
    });
    
    // Continue with normal file import
    return evaluateFileImport(localPath, node.targets, env);
  }
  
  // Existing path/URL import logic...
}
```

## CLI Commands

### mlld install (@cli/commands/install.ts)
```typescript
export async function install(moduleRef: string, options: InstallOptions) {
  // Parse @user/module
  // Resolve via registry
  // Download and cache
  // Update lock file
  // Report success
}
```

### mlld update (@cli/commands/update.ts)
```typescript
export async function update(moduleRef?: string) {
  // Read lock file
  // Check for updates
  // Download new versions
  // Update lock file
}
```

### mlld ls (@cli/commands/ls.ts)
```typescript
export async function list() {
  // Read lock file
  // Show installed modules
  // Show versions and sizes
}
```

## Implementation Steps

### Phase 1: Core Infrastructure (Day 1)
1. [ ] Create HashUtils class with SHA-256 support
2. [ ] Create ModuleCache with file system storage
3. [ ] Create basic LockFile with module tracking
4. [ ] Set up cache directory structure
5. [ ] Unit tests for each component

### Phase 2: Registry Client (Day 1-2)
1. [ ] Create RegistryClient stub (hardcode for now)
2. [ ] Add gist URL resolution
3. [ ] Add content fetching with proper headers
4. [ ] Add error handling for network issues
5. [ ] Mock registry for testing

### Phase 3: Module Resolution (Day 2)
1. [ ] Create ModuleResolver combining cache + client
2. [ ] Implement full resolution algorithm
3. [ ] Add hash validation
4. [ ] Add lock file integration
5. [ ] Handle TTL and trust options

### Phase 4: Grammar Updates (Day 2-3)
1. [ ] Update import.peggy with ModuleReference
2. [ ] Add AST node types
3. [ ] Update parser tests
4. [ ] Generate types
5. [ ] Test various import formats

### Phase 5: Interpreter Integration (Day 3)
1. [ ] Update Environment with ModuleResolver
2. [ ] Update import evaluator for modules
3. [ ] Add security checks for modules
4. [ ] Test module imports end-to-end
5. [ ] Add helpful error messages

### Phase 6: CLI Commands (Day 3-4)
1. [ ] Implement `mlld install` command
2. [ ] Implement `mlld update` command
3. [ ] Implement `mlld ls` command
4. [ ] Add progress indicators
5. [ ] Test CLI workflows

### Phase 7: Testing & Polish (Day 4)
1. [ ] Integration tests for full import flow
2. [ ] Test offline mode (cache only)
3. [ ] Test hash validation
4. [ ] Test TTL behavior
5. [ ] Performance testing

## Test Cases

### Basic Module Import
```mlld
@import { greet } from @adam/utils
@run [echo {{greet}}]
```

### Version Pinning
```mlld
@import { api } from @adam/client@f8h4
```

### TTL and Trust
```mlld
@import { live } from @news/feed (1h) <trust verify>
```

### Lock File Result
```json
{
  "modules": {
    "@adam/utils": {
      "resolved": "f8h4a9c2b5e1d7f3a8b2c9d5e2f7a1b4c8d9e3f5",
      "integrity": "sha256-abc123...",
      "source": "https://gist.githubusercontent.com/adam/123/raw/...",
      "fetchedAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

## Success Criteria

- [ ] Module imports work offline after first fetch
- [ ] Content addressing prevents tampering
- [ ] Lock file tracks all module dependencies
- [ ] CLI commands provide good UX
- [ ] Clear error messages for common issues
- [ ] Performance: <100ms for cached imports
- [ ] Security: All modules validated by hash

## Notes

- Start with read-only registry (no publishing yet)
- Use gists as MVP backend
- Cache is immutable (content-addressed)
- Lock file is source of truth
- Consider npm compatibility where sensible

## Related Documentation

### Architecture & Vision
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - Module system architecture and content addressing design
- [`REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - Complete registry ecosystem vision
- [`SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Security aspects of module distribution

### Specifications
- [`specs/import-syntax.md`](../../specs/import-syntax.md) - Detailed import syntax including module references
- [`specs/lock-file-format.md`](../../specs/lock-file-format.md) - Lock file format for dependency tracking
- [`specs/ttl-trust-syntax.md`](../../specs/ttl-trust-syntax.md) - TTL/Trust options for imports

### Related Work
- [`archive/2025-05-evolution/HASH-CACHE.md`](../../archive/2025-05-evolution/HASH-CACHE.md) - Original hash-cache design
- [`archive/2025-05-evolution/REGISTRY-PHASE1-DNS.md`](../../archive/2025-05-evolution/REGISTRY-PHASE1-DNS.md) - DNS registry design