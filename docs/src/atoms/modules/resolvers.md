---
id: modules-resolvers
title: Custom Resolvers
brief: Configure custom @ prefixes for imports
category: modules
parent: modules
tags: [modules, resolvers, prefixes, configuration]
related: [modules-importing-registry, modules-importing-local]
related-code: [core/resolvers/ResolverRegistry.ts, core/config/ResolverConfig.ts]
updated: 2026-01-05
---

**Built-in:**
- `@author/module` → Registry
- `@base/file` → Project root
- `./file.mld` → Local (with fuzzy extension matching)

**Custom prefixes** (mlld-config.json):

```json
{
  "resolvers": {
    "prefixes": [
      {
        "prefix": "@lib/",
        "resolver": "LOCAL",
        "config": { "basePath": "./src/lib" }
      },
      {
        "prefix": "@company/",
        "resolver": "GITHUB",
        "config": {
          "repository": "company/private-modules",
          "branch": "main"
        }
      }
    ]
  }
}
```

**Quick setup:**

```bash
mlld alias --name notes --path ~/notes
mlld alias --name shared --path ../shared --global
mlld setup --github   # private repo wizard
```
