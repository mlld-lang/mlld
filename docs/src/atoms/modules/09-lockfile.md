---
id: lockfile
qa_tier: 2
title: Lock File
brief: Reproducible imports via mlld-lock.json
category: modules
parent: importing
tags: [modules, lock, versions, install]
related: [importing-basics, registry, updating]
related-code: [cli/commands/install.ts]
updated: 2026-02-24
---

When you install modules, mlld creates `mlld-lock.json` to ensure reproducible imports. This file tracks exact versions and content hashes.

```json
{
  "lockfileVersion": 1,
  "modules": {
    "@alice/utils": {
      "version": "1.0.0",
      "resolved": "abc123def456...",
      "source": "@alice/utils",
      "sourceUrl": "https://registry.mlld.org/modules/@alice/utils/1.0.0",
      "integrity": "sha256:abc123...",
      "fetchedAt": "2024-01-15T10:00:00Z",
      "registryVersion": "1.0.0"
    }
  }
}
```

**Lock entry fields:**

- **version** - The exact version installed (from registry version.json)
- **resolved** - Content hash used for cache lookup (SHA256)
- **source** - Original module specifier from your imports
- **sourceUrl** - URL where the module was fetched from
- **integrity** - Content hash for verification (sha256:...)
- **fetchedAt** - Timestamp when module was installed
- **registryVersion** - Version from registry metadata (only for registry modules)

**Behavior:**

- **Auto-generated** - Created/updated by `mlld install`
- **Version control** - Commit to git for reproducible builds
- **Never edit manually** - Use CLI commands to update
- **Registry-only validation** - Lock file only enforces version matches for registry modules
- **Version pinning** - `version: "latest"` updates to newest on `mlld update`; exact version (e.g. `"1.2.0"`) stays pinned until manually changed
