# Registry System Developer Guide

This guide explains how the mlld registry system works from a developer perspective, including both the code in the mlld codebase and the structure of the `github.com/mlld-lang/registry` repository.

## Overview

The mlld registry is a decentralized system where each GitHub user maintains their own registry of modules. This provides:

- **DNS for Gists**: Maps friendly names like `mlld://adamavenir/json-utils` to gist IDs
- **Versioning**: Lock files pin specific gist revisions
- **Caching**: Local cache for offline usage
- **Security**: Advisory system for known vulnerabilities
- **Analytics**: Optional anonymous usage statistics

## Architecture

### Registry Repository Structure

The `github.com/mlld-lang/registry` repo uses a per-user structure:

```
registry/
├── README.md
├── {username}/
│   ├── registry.json    # User's module registry
│   └── advisories.json  # Security advisories
├── adamavenir/          # Example user
│   ├── registry.json
│   └── advisories.json
└── ...
```

### Registry Format

Each user's `registry.json`:

```json
{
  "version": "1.0.0",
  "updated": "2024-05-28T00:00:00Z",
  "author": "adamavenir",
  "modules": {
    "json-utils": {
      "gist": "a1f3e09a42db6c680b454f6f93efa9d8",
      "description": "JSON formatting utilities",
      "tags": ["json", "utils", "formatting"],
      "created": "2024-05-28T00:00:00Z"
    }
  }
}
```

### Advisory Format

Each user's `advisories.json`:

```json
{
  "version": "1.0.0",
  "author": "adamavenir",
  "advisories": [
    {
      "id": "2024-001",
      "created": "2024-05-28T00:00:00Z",
      "severity": "high|medium|low",
      "affects": ["module-name"],
      "gists": ["gist-id"],
      "type": "vulnerability-type",
      "description": "Description of the issue",
      "recommendation": "How to fix or work around"
    }
  ]
}
```

## Core Components

### 1. RegistryResolver (`core/registry/RegistryResolver.ts`)

Resolves `mlld://username/module` imports to gist URLs:

```typescript
class RegistryResolver {
  async resolve(importPath: string): Promise<string> {
    // Parse mlld://username/module
    // Fetch username/registry.json
    // Look up module
    // Return mlld://gist/username/gist-id
  }
  
  async fetchUserRegistry(username: string): Promise<Registry>
  async fetchUserAdvisories(username: string): Promise<AdvisoryFile>
  async checkUserAdvisories(username: string, moduleName: string, gistId: string): Promise<Advisory[]>
}
```

### 2. LockFile (`core/registry/LockFile.ts`)

Manages `.mlld/mlld.lock.json` to pin specific versions:

```typescript
class LockFile {
  getImport(importPath: string): LockEntry | undefined
  async addImport(importPath: string, entry: LockEntry): Promise<void>
  async calculateIntegrity(content: string): Promise<string>
}
```

Lock file format:
```json
{
  "version": "1.0.0",
  "imports": {
    "mlld://adamavenir/json-utils": {
      "resolved": "mlld://gist/adamavenir/a1f3e09a42db6c680b454f6f93efa9d8",
      "gistRevision": "b20e54d6dbf422252b7b670af492632f2fa6c1a2",
      "integrity": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "approvedAt": "2024-05-28T10:00:00Z"
    }
  }
}
```

### 3. Cache (`core/registry/Cache.ts`)

Manages `.mlld/cache/` directory:

```typescript
class Cache {
  async get(resolvedUrl: string, revision?: string): Promise<string | null>
  async store(resolvedUrl: string, content: string, metadata: CacheMetadata): Promise<void>
}
```

Cache structure:
```
.mlld/cache/
└── gist/
    └── username/
        └── gist_id/
            └── revision/
                ├── content.mld
                └── metadata.json
```

### 4. RegistryManager (`core/registry/RegistryManager.ts`)

High-level API that ties everything together:

```typescript
class RegistryManager {
  async resolveImport(importPath: string): Promise<string>
  async installFromLock(): Promise<void>
  async updateModule(moduleName?: string): Promise<void>
  async audit(): Promise<void>
  async search(query: string): Promise<void>
  async info(modulePath: string): Promise<void>
}
```

### 5. StatsCollector (`core/registry/StatsCollector.ts`)

Optional anonymous usage tracking:

```typescript
class StatsCollector {
  async track(module: string, event: 'import' | 'cache-hit' | 'update' | 'install'): Promise<void>
  async aggregateStats(since?: Date): Promise<AggregatedStats>
}
```

## Integration Points

### Environment Integration

The registry is integrated through the SecurityManager in the Environment:

```typescript
// In Environment.ts
getRegistryResolver(): RegistryResolver | undefined {
  if (this.securityManager) {
    return (this.securityManager as any).registryResolver;
  }
  return this.parent?.getRegistryResolver();
}
```

### Import Resolution

In `interpreter/eval/import.ts`:

```typescript
if (importPath.startsWith('mlld://')) {
  const registryResolver = env.getRegistryResolver();
  if (registryResolver) {
    resolvedPath = await registryResolver.resolve(importPath);
  }
}
```

## Import Flow

1. User writes: `@import { utils } from "mlld://adamavenir/json-utils"`
2. Import evaluator detects `mlld://` prefix
3. RegistryResolver:
   - Parses username (`adamavenir`) and module (`json-utils`)
   - Fetches `adamavenir/registry.json` from GitHub
   - Finds module entry
   - Returns `mlld://gist/adamavenir/a1f3e09a42db6c680b454f6f93efa9d8`
4. Gist importer handles the resolved path
5. After successful import, lock file is updated
6. Content is cached locally

## CLI Commands

Registry commands are implemented in `cli/commands/registry.ts`:

- `mlld registry install` - Install from lock file
- `mlld registry update [user/module]` - Update modules
- `mlld registry audit` - Check advisories
- `mlld registry search user/query` - Search user's modules
- `mlld registry info user/module` - Module details
- `mlld registry stats` - Show usage statistics

## Security Considerations

1. **Gist Ownership**: In Phase 2, validate that users own the gists they register
2. **Advisory System**: Anyone can submit advisories via PR
3. **Content Integrity**: SHA256 hashes ensure content hasn't changed
4. **Approval Flow**: First-time imports require user approval

## Future Enhancements (Phase 2)

1. **Central Index**: API at mlld.ai for cross-user search
2. **Publishing Flow**: `mlld publish` command
3. **Download Analytics**: Track popularity
4. **Verified Publishers**: Blue checkmarks
5. **Web UI**: Browse modules online

## Testing

Key test scenarios:
- Import resolution with and without lock file
- Cache hit/miss behavior  
- Advisory warnings
- Offline functionality
- Lock file integrity checks

## Migration Notes

When moving `registry/` out of this codebase:
1. Update `registryUrl` in RegistryResolver constructor
2. Ensure GitHub Actions can access the registry repo
3. Consider submodule or separate clone in CI