---
id: modules-frontmatter-access
title: Accessing Module Frontmatter
brief: Access module metadata via @fm
category: modules
parent: modules
tags: [modules, frontmatter, metadata]
related: [modules-creating, reserved-variables]
related-code: [interpreter/eval/import.ts, core/module/Frontmatter.ts]
updated: 2026-01-05
---

**Accessing frontmatter in module:**

```mlld
var @meta = {
  id: @fm.id,
  name: @fm.name,
  version: @fm.version
}
```
