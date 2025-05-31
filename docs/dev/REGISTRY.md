# Registry System Developer Guide

This guide explains how the mlld PUBLIC registry system works, using GitHub Gists for storage and DNS for discovery.

## Overview

The mlld registry is a decentralized PUBLIC module system that provides:

- **DNS-based Discovery**: Module names resolve via TXT records at `public.mlld.ai`
- **Gist Storage**: All modules are PUBLIC GitHub gists with content addressing
- **Immutable Versions**: Commit hashes ensure exact version pinning
- **Local Caching**: Fast offline access with hash verification
- **Zero Infrastructure**: No servers needed - just DNS and GitHub

## Architecture

### DNS Resolution Model

```
@alice/utils → alice-utils.public.mlld.ai → TXT "v=mlld1;url=https://gist..."
```

### Registry Repository Structure

The `github.com/mlld-lang/registry` repo structure:

```
registry/
├── README.md
├── modules.json         # All registered modules
├── dns/
│   └── records.json     # DNS sync manifest
├── tools/
│   ├── validate.js      # Module validation
│   ├── publish.js       # Publishing helper
│   └── dns-sync.js      # DNS record updater
└── modules/             # Future: per-author dirs
```

### Module Registry Format

The `modules.json` file contains all registered modules:

```json
{
  "@alice/utils": {
    "name": "@alice/utils",
    "description": "Common utilities for mlld scripts",
    "author": {
      "name": "Alice Johnson",
      "github": "alicej"
    },
    "source": {
      "type": "gist",
      "id": "8bb1c645c1cf0dd515bd8f834fb82fcf",
      "hash": "59d76372d3c4a93e7aae34cb98b13a8e99dfb95f",
      "url": "https://gist.githubusercontent.com/alicej/8bb1c645c1cf0dd515bd8f834fb82fcf/raw/59d76372d3c4a93e7aae34cb98b13a8e99dfb95f/utils.mld"
    },
    "dependencies": {
      "@bob/helpers": "a8c3f2d4e5b6c7d8e9f0a1b2c3d4e5f6"
    },
    "keywords": ["utils", "helpers", "strings"],
    "mlldVersion": ">=0.5.0",
    "publishedAt": "2024-01-15T10:30:00Z"
  }
}
```

### DNS Record Format

DNS TXT records at `public.mlld.ai`:

```
alice-utils.public.mlld.ai. IN TXT "v=mlld1;url=https://gist.githubusercontent.com/alicej/8bb1c645c1cf0dd515bd8f834fb82fcf/raw/59d76372d3c4a93e7aae34cb98b13a8e99dfb95f/utils.mld"
```

## Core Components

### 1. RegistryClient (`core/registry/RegistryClient.ts`)

Resolves module imports using DNS and fallback to GitHub:

```typescript
class RegistryClient {
  private dnsResolver = new DNSResolver();
  
  async resolve(moduleId: string): Promise<ModuleInfo> {
    // Convert @alice/utils to alice-utils.public.mlld.ai
    const domain = this.moduleToDomain(moduleId);
    
    try {
      // Query DNS TXT record
      const txtRecords = await this.dnsResolver.resolveTxt(domain);
      const mlldRecord = this.parseMlldRecord(txtRecords);
      
      if (mlldRecord) {
        return {
          id: moduleId,
          url: mlldRecord.url,
          source: 'dns'
        };
      }
    } catch (e) {
      // DNS lookup failed, try GitHub fallback
    }
    
    // Fallback to registry cache on GitHub
    return this.fetchFromGitHub(moduleId);
  }
}
```

### 2. DNSResolver (`core/registry/DNSResolver.ts`)

Handles DNS TXT record queries:

```typescript
class DNSResolver {
  private resolver = new Resolver();
  
  async resolveTxt(domain: string): Promise<string[]> {
    // Use public DNS resolvers for consistency
    this.resolver.setServers(['1.1.1.1', '1.0.0.1']);
    
    const records = await this.resolver.resolveTxt(domain);
    return records.flat();
  }
}
```

### 3. ImmutableCache (`core/registry/ImmutableCache.ts`)

Content-addressed cache for module storage:

```typescript
class ImmutableCache {
  async get(hash: string): Promise<string | null>
  async store(content: string): Promise<string> // returns hash
  async has(hash: string): Promise<boolean>
}
```

### 4. LockFile (`core/registry/LockFile.ts`)

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
    "@alice/utils": {
      "resolved": "https://gist.githubusercontent.com/alicej/.../utils.mld",
      "hash": "59d76372d3c4a93e7aae34cb98b13a8e99dfb95f",
      "integrity": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "resolvedAt": "2024-05-28T10:00:00Z"
    }
  }
}
```

### 5. RegistryManager (`core/registry/RegistryManager.ts`)

High-level API that ties everything together:

```typescript
class RegistryManager {
  async resolveImport(importPath: string): Promise<string>
  async installFromLock(): Promise<void>
  async updateModule(moduleName?: string): Promise<void>
  async search(query: string): Promise<void>
  async info(modulePath: string): Promise<void>
}
```

## Integration Points

### Import Resolution

In `interpreter/eval/import.ts`:

```typescript
// Module import pattern: @username/module
if (importPath.match(/^@[a-z0-9-]+\/[a-z0-9-]+$/)) {
  const registryClient = env.getRegistryClient();
  if (registryClient) {
    const moduleInfo = await registryClient.resolve(importPath);
    resolvedPath = moduleInfo.url;
  }
}
```

## Import Flow

1. User writes: `@import { utils } from @alice/json-utils`
2. Import evaluator detects module pattern `@username/module`
3. RegistryClient resolution:
   - Converts to DNS: `alice-json-utils.public.mlld.ai`
   - Queries TXT record
   - Gets: `v=mlld1;url=https://gist.githubusercontent.com/...`
   - Falls back to GitHub registry if DNS fails
4. Content fetched from gist URL
5. Hash verified against URL
6. Lock file updated with resolution
7. Content cached by hash

## CLI Commands

Registry commands are implemented in `cli/commands/registry.ts`:

- `mlld registry sync` - Sync local cache with registry
- `mlld registry search <query>` - Search available modules
- `mlld registry info @user/module` - Module details
- `mlld registry update [@user/module]` - Update module(s)
- `mlld registry cache` - Manage local cache

## Module Requirements

### Gist Format

Every module must be a PUBLIC gist with required frontmatter:

```mlld
---
author: alice
module: @alice/utils
description: Utility functions for mlld scripts
---

# Module exports
@text helper = "I'm a helpful module!"
@exec format_json(data) = @run [jq '.' <<< '{{data}}']
```

### Required Frontmatter
- `author`: GitHub username (must match gist owner)
- `module`: Full module name (@username/module-name)
- `description`: Clear description of module purpose

## Publishing Flow

1. **Create Gist**: Author creates PUBLIC gist with mlld code
2. **Get Raw URL**: Copy raw URL with commit hash
3. **Fork Registry**: Fork `mlld-lang/registry` repo
4. **Add Module**: Update `modules.json` with module entry
5. **Validate**: Run `node tools/validate.js`
6. **Submit PR**: Create pull request
7. **DNS Sync**: After merge, DNS records auto-created

## Security Considerations

1. **PUBLIC Only**: All registry modules are PUBLIC by design
2. **Content Addressing**: Commit hashes ensure immutability
3. **DNS Security**: DNSSEC protects against DNS hijacking
4. **Hash Verification**: All content verified before use
5. **No Secrets**: Authors must never include secrets

## Registry Tools

### For Maintainers
- `tools/dns-sync.js` - Update DNS records from modules.json
- `tools/validate.js` - Validate all module entries

### For Authors
- `tools/publish.js` - Generate metadata and instructions

## Testing

Key test scenarios:
- DNS resolution (with fallback)
- Hash verification
- Cache functionality
- Lock file generation
- Offline mode

## Future Enhancements

1. **Web Interface**: Browse modules at mlld.ai/registry
2. **Advisory System**: Security vulnerability tracking
3. **Analytics**: Anonymous usage statistics
4. **MCP Servers**: Registry for Model Context Protocol servers
5. **IPFS Mirror**: Decentralized backup storage