# Hash-Based Module Cache & Import System

## Overview

A unified system for managing external dependencies in mlld using content-addressed storage with git-like short hashes for versioning.

## Core Concepts

### 1. Content Addressing
Every piece of imported content is stored by its SHA256 hash with a short hash for human use:
- Full hash: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- Short hash: `e3b0c4` (minimum 4 characters, more if needed to avoid collisions)

### 2. Unified Import System
All external content (registry modules, URLs, static files) goes through the same flow:
```bash
mlld install @username/module              # From registry
mlld install [https://example.com/file]    # From URL
mlld install [./shared/lib.mld] --alias lib  # Local file with alias
```

### 3. Lock File as Namespace
The `mlld.lock.json` becomes the project-wide namespace for all imports:
```json
{
  "version": "1.0.0",
  "modules": {
    "@adamavenir/json-utils": {
      "resolved": "https://gist.githubusercontent.com/adamavenir/abc123/raw/content.mld",
      "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "shortHash": "e3b0c4",
      "installedAt": "2024-01-25T10:00:00Z",
      "ttl": 604800000,  // Optional: 7 days in ms
      "lastChecked": "2024-01-25T10:00:00Z"
    },
    "companydata": {
      "resolved": "https://cdn.example.com/data.json",
      "hash": "sha256:a1b2c3d4e5f6789012345678901234567890123456789012345678901234",
      "shortHash": "a1b2c3",
      "installedAt": "2024-01-25T11:00:00Z",
      "lastChecked": "2024-01-25T11:00:00Z",
      "alias": true
    }
  }
}
```

## Import Syntax

### Current Syntax (Unchanged)
```meld
# Local files - paths in brackets
@import { helper } from [./lib/utils.mld]
@import { * } from [../shared/common.mld]

# URLs - paths in brackets
@import { tool } from [https://example.com/tool.mld]
```

### New Syntax (Lock File References)
```meld
# Registry modules - no brackets needed
@import { format, validate } from @adamavenir/json-utils
@import { format } from @adamavenir/json-utils@e3b0c4

# Aliases - no brackets needed (referenced as variables)
@import { schema } from @companydata
```

### Invalid Syntax (Will Error)
```meld
# This looks like a path variable, not a module reference
@import { bad } from [@username/module]  # ❌ ERROR
```

## CLI Commands

### Installing Modules

```bash
# Install from registry
mlld install @username/module
mlld i @username/module  # Short form

# Install from URL with optional alias
mlld install [https://example.com/tool.mld]
mlld install [https://example.com/tool.mld] --alias mytool

# Install with TTL (time-to-live)
mlld install @username/module --ttl 5h
mlld install [https://api.com/data.json] --alias apidata --ttl 7d

# Install specific version
mlld install @username/module@e3b0c4
```

### Managing Modules

```bash
# List all installed modules
mlld ls
# Output:
# @adamavenir/json-utils@e3b0c4
# companydata (alias) → https://cdn.example.com/data.json@a1b2c3

# List only aliases
mlld ls alias
# Output:
# companydata → https://cdn.example.com/data.json@a1b2c3

# Update module to latest (respects TTL)
mlld update @username/module
mlld update @companydata  # Update alias

# Update all modules (respects TTL)
mlld update all

# Force update, ignoring TTL
mlld update --force
mlld update @username/module --force

# Remove module
mlld rm @username/module
mlld rm companydata
```

### Adding Static Resources

```bash
# Add any URL as a cached resource
mlld add [https://cdn.example.com/config.json] --alias config
mlld add [https://api.example.com/schema.json] --alias apischema --ttl 1h
```

## Cache Structure

```
.mlld/
├── cache/
│   └── content/
│       ├── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
│       ├── e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.meta.json
│       └── a1b2c3d4e5f6789012345678901234567890123456789012345678901234
└── mlld.lock.json
```

### Metadata Format
```json
{
  "url": "https://example.com/tool.mld",
  "hash": "sha256:e3b0c44298fc...",
  "shortHash": "e3b0c4",
  "cachedAt": "2024-01-25T10:00:00Z",
  "size": 1234,
  "contentType": "text/plain"
}
```

## Resolution Algorithm

When encountering an import:

1. **Check if it's a lock file reference** (no brackets)
   - Look for exact match in lock file modules
   - Look for alias match in lock file (must use @ prefix)
   - If version specified, ensure it matches locked version
   
2. **If not found, check if it's a path** (has brackets)
   - Resolve as current behavior
   
3. **TTL validation** (if found in lock)
   - If TTL exists and `lastChecked + ttl < now`, mark for update
   - Otherwise use cached version
   
4. **Error conditions**
   - Module name conflicts with local file
   - Alias conflicts with existing module name
   - Version mismatch (importing @user/module@abc123 when @user/module@def456 is locked)
   - Attempting to import same module with different versions

## Nested Import Handling

When an imported module contains imports:

1. **Process recursively** - Parse and resolve nested imports
2. **Namespace isolation** - Nested imports don't pollute parent namespace
3. **Version conflicts** - If A imports B@123 and C imports B@456, both versions are cached
4. **Lock file records** - All transitive dependencies recorded

Example:
```meld
# main.mld
@import { helper } from @user/module

# @user/module imports @other/lib internally
# This is resolved and cached but not exposed to main.mld namespace
```

## Version Conflict Handling

### Installation Behavior
- Installing a module at a different version overwrites the previous version
- Only one version of a module can be locked at a time
- Example: `mlld install @user/lib@def456` replaces existing `@user/lib@abc123`

### Import Behavior
- Importing a module with mismatched version throws an error
- Importing the same module twice with different versions throws an error
- This prevents subtle bugs from version mismatches

## Security Integration

All imports go through standard security flow:
1. **Fetch content**
2. **Check advisories** (if from registry)
3. **Show preview** for approval
4. **Calculate hash**
5. **Store in cache**
6. **Update lock file**

## Benefits

1. **Reproducible Builds** - Lock file ensures same content
2. **Offline Support** - Everything cached locally
3. **Version Control** - Lock file tracks all dependencies
4. **Quick Updates** - `mlld update all` refreshes everything
5. **No URL Repetition** - Use aliases instead
6. **Git-like Workflow** - Familiar hash-based versioning

## Migration Notes

Since mlld has no users yet (😅), we can implement this cleanly without migration concerns!

## Implementation Order

1. **Phase 1**: Extend cache to use full content addressing
2. **Phase 2**: Implement lock file structure
3. **Phase 3**: Add CLI commands (install, update, rm, ls)
4. **Phase 4**: Update import resolution to check lock file
5. **Phase 5**: Add alias support
6. **Phase 6**: Handle nested imports

## Future Enhancements

1. **Integrity Subresource-style URLs**: 
   ```meld
   @import { x } from [https://example.com/file.mld#sha256=e3b0c4...]
   ```

2. **Lock File Merge Conflicts**: Git-friendly conflict resolution

3. **Garbage Collection**: Clean up unused cached versions

4. **Offline Bundles**: Export cache for airgapped environments

This system unifies all external content handling while maintaining mlld's security-first approach!