---
id: modules-creating
title: Creating Modules
brief: Module structure with frontmatter and exports
category: modules
parent: modules
tags: [modules, frontmatter, exports, creation]
related: [modules-exporting, modules-importing]
related-code: [interpreter/eval/import.ts, core/module/Module.ts]
updated: 2026-01-05
---

```mlld
---
name: text-utils
author: alice
version: 1.0.0
about: String helpers
license: CC0
---

needs {
  js: []
}

exe @upper(s) = js { return s.toUpperCase() }
exe @trim(s) = js { return s.trim() }

export { @upper, @trim }
```

**Frontmatter fields:**
- `name` - Module name (required for registry)
- `author` - Your username (required for registry)
- `version` - Semver version
- `about` - Brief description
- `license` - License (CC0 recommended)
