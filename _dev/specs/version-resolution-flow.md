# Version Resolution Flow Specification

Version: 1.0  
Last Updated: 2025-05-30

## Overview

This document specifies how mlld resolves module versions, from initial fetch through updates. The system is designed around content-addressing with ergonomic defaults.

## Core Principles

1. **Content-addressed**: Every version identified by SHA-256 hash
2. **Least surprise**: First fetch locks to that version
3. **Explicit updates**: Versions don't change unless requested
4. **Flexible caching**: TTL controls refresh behavior

## Resolution Flow

### 1. Initial Module Request
```mlld
@import { utils } from @alice/helper
```

**Flow**:
1. Check lock file for existing resolution
2. If not found, query resolver (DNS/local/etc)
3. Fetch current version from source
4. Hash the content (SHA-256)
5. Store in cache by hash
6. Record in lock file with commit/version ID
7. Use cached content

**Result**: Module locked to specific version

### 2. Subsequent Uses
```mlld
@import { utils } from @alice/helper  # Same import
```

**Flow**:
1. Check lock file - found!
2. Use cached content by hash
3. No network access needed

**Result**: Deterministic, offline-capable

### 3. Live Mode (Always Fresh)
```mlld
@import { utils } from @alice/helper (live)
```

**Flow**:
1. Ignore lock file entry
2. Always fetch latest from source
3. Update cache with new content
4. Do NOT update lock file
5. Use fresh content

**Result**: Real-time updates, no persistence

### 4. TTL-Based Caching
```mlld
@import { api } from @service/client (1h)
```

**Flow**:
1. Check lock file with TTL
2. If age < TTL, use cached
3. If age > TTL, fetch fresh
4. Update lock file timestamp
5. Update cache if content changed

**Result**: Balanced freshness/performance

### 5. Explicit Version Request
```mlld
@import { utils } from @alice/helper@f8h4
```

**Flow**:
1. Look for content hash starting with "f8h4"
2. If multiple matches, use shortest unique
3. If in cache, use it
4. If not, fetch from source and verify hash
5. Lock to this specific version

**Result**: Reproducible specific version

### 6. Manual Update
```bash
mlld update @alice/helper
```

**Flow**:
1. Fetch latest from source
2. Compare with locked version
3. If different, update lock file
4. Cache new content
5. Report version change

**Result**: Controlled version updates

## Lock File Recording

### Initial Fetch
```json
{
  "@alice/helper": {
    "resolved": "f8h4a9c2b5e1d7f3a8b2c9d5e2f7a1b4c8d9e3f5",
    "integrity": "sha256-base64...",
    "source": "https://github.com/alice/modules/blob/abc123/helper.mld",
    "commit": "abc123",
    "fetchedAt": "2024-01-15T10:00:00Z",
    "ttl": "static"
  }
}
```

### After TTL Refresh
```json
{
  "@alice/helper": {
    "resolved": "a1b2c3d4e5f6...",  // New hash if content changed
    "source": "https://github.com/alice/modules/blob/def456/helper.mld",
    "commit": "def456",  // New commit
    "fetchedAt": "2024-01-15T11:00:00Z",  // Updated timestamp
    "ttl": "1h"
  }
}
```

## Version Precedence

When multiple version specifications exist:

1. **Inline wins**: `@import { x } from @alice/helper@f8h4 (live)`
   - Specific hash: `f8h4`
   - TTL: `live`

2. **Import-specific**: `@import { x } from @alice/helper (1h)`
   - Version: from lock file
   - TTL: `1h` (overrides lock)

3. **Lock file**: Previous resolution
   - Version: locked hash
   - TTL: from lock file

4. **Default**: First fetch
   - Version: current at fetch time
   - TTL: `static`

## TTL Behavior Matrix

| TTL Value | Behavior | Use Case |
|-----------|----------|----------|
| `(static)` | Never refresh (default) | Stable modules |
| `(live)` | Always fetch fresh | Real-time data |
| `(30s)` | Cache for 30 seconds | Rapid updates |
| `(5m)` | Cache for 5 minutes | API responses |
| `(1h)` | Cache for 1 hour | External configs |
| `(7d)` | Cache for 7 days | Slow-changing data |

## Source Version Tracking

### GitHub/Gist
- Track git commit hash
- URL includes commit: `/blob/abc123/`
- Enables diff viewing

### GitLab
- Track git commit hash  
- URL includes commit: `/-/blob/abc123/`

### Generic URLs
- Track ETag if provided
- Track Last-Modified header
- Fall back to content hash only

## Update Strategies

### Manual Update
```bash
mlld update @alice/helper     # Update specific
mlld update                   # Update all
mlld update --check          # Dry run
```

### Automated Update
```json
{
  "updatePolicy": {
    "@alice/*": "weekly",
    "@company/*": "never",
    "@api/*": "daily"
  }
}
```

### Version Pinning
```mlld
# Pin to exact content
@import { x } from @alice/helper@f8h4a9c2b5e1d7f3

# Pin to commit (GitHub)
@import { x } from @alice/helper@commit:abc123
```

## Error Handling

### Version Not Found
```
Error: Version not found: @alice/helper@xyz9
Available versions:
  f8h4a9c2... (current)
  a1b2c3d4... (2 days ago)
```

### Update Conflicts
```
Warning: @alice/helper has been updated
  Current: f8h4a9c2... (2024-01-15)
  Latest:  a1b2c3d4... (2024-01-17)
  
Run 'mlld update @alice/helper' to update
```

### TTL Conflicts
```
Warning: Multiple TTL values for @alice/helper
  Lock file: 7d
  Import: 1h
  Using: 1h (most specific)
```

## Best Practices

1. **Development**: Use `(live)` or short TTL for actively changing modules
2. **Production**: Use explicit versions or `(static)`
3. **APIs**: Use appropriate TTL for rate limits
4. **Updates**: Review changes before updating
5. **CI/CD**: Check in lock files for reproducibility

## Future Extensions

- Semantic version ranges: `@alice/helper@^1.2.0`
- Update channels: `@alice/helper@stable`
- Deprecation warnings
- Version history commands
- Automatic security updates