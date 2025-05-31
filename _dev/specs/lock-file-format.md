# mlld Lock File Format Specification

Version: 1.0  
Last Updated: 2025-05-29

## Overview

The mlld lock file (`mlld.lock.json`) records all module dependencies, security decisions, and cache metadata to ensure reproducible builds and security policies.

## File Locations

- **Global**: `~/.mlld/mlld.lock.json` - User-wide settings and cache
- **Project**: `./mlld.lock.json` - Project-specific dependencies

## Format Specification

### Root Structure
```json
{
  "version": 1,
  "metadata": {
    "mlldVersion": "0.5.0",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T14:30:00Z"
  },
  "modules": { ... },
  "devModules": { ... },
  "security": { ... },
  "cache": { ... }
}
```

### Module Entry
```json
{
  "@alice/utils": {
    "resolved": "f8h4a9c2b5e1d7f3a8b2c9d5e2f7a1b4c8d9e3f5a6b7c8d9e0f1a2b3",
    "integrity": "sha256-Qw1bHtLNfhLjfW5V7HgqTB3G6HgpTbSjs8yH4rPkLJI=",
    "source": "https://gist.githubusercontent.com/alice/8bb1c645c1cf0dd515bd8f834fb82fcf/raw/59d76372d3c4a93e7aae34cb98b13a8e99dfb95f/utils.mld",
    "fetchedAt": "2024-01-15T10:30:00Z",
    "ttl": "7d",
    "trust": "verify",
    "advisories": ["MLLD-2024-0001"],
    "dependencies": {
      "@bob/helpers": "^1.2.0"
    }
  }
}
```

### Security Section
```json
{
  "security": {
    "approvedImports": {
      "https://example.com/template.mld": {
        "hash": "sha256-abc123...",
        "approvedAt": "2024-01-15T10:00:00Z",
        "approvedBy": "user"
      }
    },
    "blockedPatterns": [
      "rm -rf /",
      ":(){ :|:& };:"
    ],
    "trustedDomains": [
      "github.com",
      "githubusercontent.com"
    ],
    "policies": {
      "commands": {
        "default": "verify",
        "rules": {
          "npm run *": "always",
          "rm *": "never"
        }
      },
      "paths": {
        "default": "verify",
        "allowed": ["./", "~/mlld-workspace"],
        "blocked": ["/etc", "/sys", "/proc"]
      }
    },
    "registries": {
      "default": {
        "url": "https://registry.mlld.ai",
        "priority": 1
      },
      "custom": {
        "url": "https://custom.example.com",
        "priority": 2,
        "patterns": ["@company/*"]
      }
    }
  }
}
```

### Cache Section
```json
{
  "cache": {
    "urls": {
      "https://api.example.com/data": {
        "hash": "sha256-def456...",
        "cachedAt": "2024-01-15T12:00:00Z",
        "ttl": "1h",
        "expires": "2024-01-15T13:00:00Z"
      }
    },
    "stats": {
      "totalSize": 1048576,
      "moduleCount": 42,
      "lastCleanup": "2024-01-14T00:00:00Z"
    }
  }
}
```

## Field Definitions

### Module Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resolved | string | Yes | Full SHA-256 hash of module content |
| integrity | string | Yes | SRI-style integrity hash |
| source | string | Yes | Original URL/path where module was fetched |
| fetchedAt | string | Yes | ISO 8601 timestamp of when fetched |
| ttl | string | No | Time-to-live for cache ("7d", "1h", "static", "live") |
| trust | string | No | Trust level ("always", "verify", "never") |
| advisories | array | No | Known security advisories affecting this version |
| dependencies | object | No | Module's own dependencies |

### Security Fields

| Field | Type | Description |
|-------|------|-------------|
| approvedImports | object | URLs/paths that user has approved |
| blockedPatterns | array | Command patterns to always block |
| trustedDomains | array | Domains allowed for URL imports |
| policies | object | Granular security policies |

### Cache Fields

| Field | Type | Description |
|-------|------|-------------|
| urls | object | Cached URL content with TTL |
| stats | object | Cache statistics and maintenance info |

## Precedence Rules

### Security Precedence (Restrictive Wins)
```
Global Block > Project Block > Global Policy > Project Policy > Default
```

### TTL Precedence (Specific Wins)
```
Inline TTL > Project Lock > Global Lock > Default
```

## Version History

### Version 1 (Current)
- Initial format
- Module dependencies
- Security policies
- Cache metadata

### Future Versions
- Version 2: Add signatures
- Version 3: Add federation support

## Implementation Notes

### Atomic Updates
Lock files must be updated atomically to prevent corruption:
```javascript
const tmpFile = `${lockFile}.tmp`;
await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
await fs.rename(tmpFile, lockFile);
```

### Migration
When version changes, migrate existing lock files:
```javascript
if (lockData.version < CURRENT_VERSION) {
  lockData = migrateLockFile(lockData);
}
```

### Validation
Validate lock file on load:
```javascript
const schema = {
  type: 'object',
  properties: {
    version: { type: 'number', minimum: 1 },
    modules: { type: 'object' },
    // ... rest of schema
  },
  required: ['version', 'metadata']
};
```

## Examples

### Minimal Lock File
```json
{
  "version": 1,
  "metadata": {
    "mlldVersion": "0.5.0",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  },
  "modules": {}
}
```

### Full Example
```json
{
  "version": 1,
  "metadata": {
    "mlldVersion": "0.5.0",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T14:30:00Z"
  },
  "modules": {
    "@alice/utils": {
      "resolved": "f8h4a9c2b5e1d7f3a8b2c9d5e2f7a1b4c8d9e3f5a6b7c8d9e0f1a2b3",
      "integrity": "sha256-Qw1bHtLNfhLjfW5V7HgqTB3G6HgpTbSjs8yH4rPkLJI=",
      "source": "https://gist.githubusercontent.com/alice/123/raw/456/utils.mld",
      "fetchedAt": "2024-01-15T10:30:00Z",
      "ttl": "7d",
      "trust": "verify"
    }
  },
  "security": {
    "policies": {
      "commands": {
        "default": "verify"
      }
    }
  }
}
```