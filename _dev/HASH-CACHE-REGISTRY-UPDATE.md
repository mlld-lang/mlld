# Hash Cache Registry Update Implementation Plan

## Overview
Update the registry system to support content-addressed storage with git-like short hashes and implement new CLI commands for module management.

## Context
- Read `_dev/HASH-CACHE.md` for the full design
- Read `CLAUDE.md` for project conventions
- This is phase 1 of 3 for implementing the hash cache system

## Current State
- `core/registry/` contains: LockFile, Cache, RegistryResolver, RegistryManager
- Lock file currently uses gist-specific structure
- Cache is organized by gist ID and revision
- CLI has basic registry commands but no install/add/rm

## Implementation Tasks

### 1. Update Lock File Structure
**File**: `core/registry/LockFile.ts`

Current structure:
```json
{
  "imports": {
    "mlld://user/module": {
      "resolved": "mlld://gist/...",
      "gistRevision": "abc123",
      "integrity": "sha256:...",
      "approvedAt": "...",
      "approvedBy": "..."
    }
  }
}
```

New structure:
```json
{
  "version": "1.0.0",
  "modules": {
    "@user/module": {
      "resolved": "https://...",
      "hash": "sha256:full-hash",
      "shortHash": "e3b0c4",
      "installedAt": "2024-01-25T10:00:00Z",
      "lastChecked": "2024-01-25T10:00:00Z",
      "ttl": 604800000  // optional, in ms
    },
    "@myalias": {
      "resolved": "https://...",
      "hash": "sha256:full-hash", 
      "shortHash": "a1b2c3",
      "installedAt": "2024-01-25T10:00:00Z",
      "lastChecked": "2024-01-25T10:00:00Z",
      "alias": true
    }
  }
}
```

Key changes:
- Rename `imports` → `modules`
- Remove gist-specific fields
- Add `hash`, `shortHash`, `lastChecked`, `ttl`
- Support aliases with `alias: true` flag
- Module keys use `@` prefix

### 2. Update Cache to Content-Addressed Storage
**File**: `core/registry/Cache.ts`

Current structure:
```
.mlld/cache/gist/username/gist_id/revision/
```

New structure:
```
.mlld/cache/content/
├── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
├── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.meta.json
└── a1b2c3d4e5f6789012345678901234567890123456789012345678901234
```

Metadata format:
```json
{
  "url": "https://example.com/file.mlld",
  "hash": "sha256:e3b0c44298fc...",
  "shortHash": "e3b0c4",
  "cachedAt": "2024-01-25T10:00:00Z",
  "size": 1234,
  "contentType": "text/plain"
}
```

Key methods to update:
- `store(content: string, metadata: CacheMetadata): Promise<string>` - returns short hash
- `get(hash: string): Promise<string | null>` - accepts short or full hash
- `getMetadata(hash: string): Promise<CacheMetadata | null>`

### 3. Add Hash Generation Utilities
**New file**: `core/registry/HashUtils.ts`

```typescript
export class HashUtils {
  // Generate SHA256 hash of content
  static async generateHash(content: string): Promise<string>;
  
  // Get short hash (min 4 chars, extend if collision)
  static getShortHash(fullHash: string, existingHashes: Set<string>): string;
  
  // Parse module reference (@user/module@version)
  static parseModuleRef(ref: string): {
    module: string;
    version?: string;
  };
  
  // Parse TTL strings (5h, 7d, etc)
  static parseTTL(ttl: string): number;
}
```

### 4. New CLI Commands
**File**: `cli/commands/install.ts` (new)

```typescript
// mlld install @user/module [--ttl 5h]
// mlld install [https://...] --alias myalias [--ttl 7d]
export async function installCommand(args: string[], options: InstallOptions);
```

**File**: `cli/commands/add.ts` (new)

```typescript
// mlld add [https://...] --alias myalias [--ttl 1h]
export async function addCommand(url: string, options: AddOptions);
```

**File**: `cli/commands/ls.ts` (new)

```typescript
// mlld ls [alias]
export async function lsCommand(filter?: 'alias');
```

**File**: `cli/commands/rm.ts` (new)

```typescript
// mlld rm @user/module
// mlld rm @myalias
export async function rmCommand(module: string);
```

**File**: `cli/commands/update.ts` (new)

```typescript
// mlld update [--force]
// mlld update @user/module [--force]
export async function updateCommand(module?: string, options?: UpdateOptions);
```

### 5. Update RegistryManager
**File**: `core/registry/RegistryManager.ts`

New methods:
- `install(ref: string, options?: { alias?: string, ttl?: string })`
- `add(url: string, alias: string, ttl?: string)`
- `remove(module: string)`
- `list(filter?: 'alias'): ModuleEntry[]`
- `checkTTL(module: string): boolean`
- `updateModule(module: string, force?: boolean)`

Update existing:
- `resolveImport()` - check lock file for @user/module and @alias refs
- Remove gist-specific logic

### 6. Update CLI Entry Point
**File**: `cli/index.ts`

Add new commands to the CLI router:
- `mlld install` → installCommand
- `mlld i` → installCommand (alias)
- `mlld add` → addCommand  
- `mlld ls` → lsCommand
- `mlld rm` → rmCommand
- `mlld update` → updateCommand

## Testing Plan

1. **Unit tests for HashUtils**
   - Hash generation
   - Short hash collision handling
   - Module ref parsing
   - TTL parsing

2. **Integration tests for commands**
   - Install from registry
   - Install from URL with alias
   - List modules and aliases
   - Remove modules
   - Update with TTL

3. **Lock file migration**
   - Test reading old format
   - Auto-migrate on first use

## Migration Strategy

Since mlld has no users yet (😅), we can:
1. Change the format directly
2. Add a version check that errors on old format
3. Provide clear error message with migration instructions

## Success Criteria

- [ ] Lock file uses new content-addressed format
- [ ] Cache stores by hash instead of gist structure  
- [ ] All new CLI commands working
- [ ] TTL support implemented
- [ ] Short hash collision handling
- [ ] Tests passing

## Next Steps

After this phase:
1. Update grammar to support new import syntax (HASH-CACHE-GRAMMAR-UPDATE.md)
2. Update interpreter to use lock file (HASH-CACHE-INTERPRETER-UPDATE.md)