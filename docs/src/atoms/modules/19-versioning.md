---
id: versioning
qa_tier: 2
title: Versioning
brief: Semantic versioning, tags, and version ranges
category: modules
tags: [modules, versioning, semver, tags]
related: [publishing-public, registry, updating, lockfile]
related-code: [cli/commands/publish.ts, cli/commands/install.ts]
updated: 2026-02-24
---

## Semantic Versioning

Follow semver (major.minor.patch):
- **1.0.0** - Initial release
- **1.0.1** - Bug fix (backward compatible)
- **1.1.0** - New feature (backward compatible)
- **2.0.0** - Breaking change

## Version Tags

Publish with tags:

```bash
mlld publish --tag beta my-tool.mld.md
```

Import via tag:

```mlld
import { @helper } from @alice/my-tool@beta
import { @helper } from @alice/utils@^1.0.0
```

Common tags:
- `latest` - Most recent stable (default)
- `stable` - Recommended version
- `beta` - Beta testing
- `alpha` - Alpha testing

## Version Ranges

Specify ranges in `mlld-config.json`:

```json
{
  "dependencies": {
    "@alice/my-tool": "^1.0.0",
    "@bob/utils": "~1.2.0",
    "@eve/lib": ">=1.0.0 <2.0.0"
  }
}
```

Lock file pins exact versions.

## Version Resolution in Imports

| Import | Version |
|--------|---------|
| `import ... from @alice/utils` | latest |
| `import ... from @alice/utils@1.0.0` | exact |
| `import ... from @alice/utils@^1.0.0` | compatible |
| `import ... from @alice/utils@beta` | tag |
