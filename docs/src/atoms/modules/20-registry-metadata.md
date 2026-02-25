---
id: registry-metadata
qa_tier: 3
title: Registry Metadata
brief: Registry file structure, metadata.json, version.json, tags.json
category: modules
tags: [modules, registry, metadata, publishing]
related: [publishing-public, versioning, ownership-permissions]
related-code: [cli/commands/publish.ts]
updated: 2026-02-24
---

## Registry Structure

Modules are stored with version history:

```
registry/
└── modules/
    └── alice/
        └── my-tool/
            ├── metadata.json      # Core info, owners
            ├── 1.0.0.json         # Version 1.0.0
            ├── 1.0.1.json         # Version 1.0.1
            └── tags.json          # latest, stable, etc.
```

## metadata.json

```json
{
  "name": "my-tool",
  "author": "alice",
  "about": "Brief description",
  "owners": ["alice"],
  "maintainers": [],
  "created": "2024-01-01T00:00:00Z",
  "createdBy": 12345,
  "firstPublishPR": 123
}
```

## {version}.json

```json
{
  "version": "1.0.0",
  "needs": ["js", "sh"],
  "license": "CC0",
  "mlldVersion": ">=1.0.0",
  "source": {
    "type": "github",
    "url": "https://raw.githubusercontent.com/...",
    "contentHash": "sha256:abc123...",
    "repository": {
      "type": "git",
      "url": "https://github.com/alice/repo",
      "commit": "abc123",
      "path": "my-tool.mld.md"
    }
  },
  "dependencies": {
    "js": {
      "packages": ["lodash"]
    }
  },
  "keywords": ["utility", "automation"],
  "publishedAt": "2024-01-01T00:00:00Z",
  "publishedBy": 12345
}
```

Key fields:
- **publishedBy** - GitHub user ID of the publisher (numeric ID, not username)
- **publishedAt** - ISO timestamp when this version was published
- **source.type** - Source type: `github`, `gist`, or `private-repo`
- **source.contentHash** - SHA256 hash for content verification
- **source.repository** - Git repository metadata (for github/private-repo sources)

## tags.json

```json
{
  "latest": "1.0.1",
  "stable": "1.0.1",
  "beta": "2.0.0-beta.1"
}
```

## Registry API

```bash
# Resolve version
curl https://registry-api.mlld.org/api/resolve?module=@alice/my-tool

# Direct publish
curl -X POST https://registry-api.mlld.org/api/publish \
  -H "Authorization: Bearer $TOKEN" \
  -F "module=@my-tool.mld.md"
```
