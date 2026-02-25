---
id: file-loading-frontmatter
qa_tier: 2
title: Frontmatter
brief: Document metadata at file start, accessed via @fm
category: core
parent: file-loading
tags: [frontmatter, metadata, fm]
related: [file-loading-basics, modules-creating, reserved-variables]
related-code: [core/frontmatter/Parser.ts, interpreter/eval/import.ts, core/module/Frontmatter.ts]
updated: 2026-01-05
---

YAML metadata block at the top of any mlld file:

```yaml
---
name: my-module
author: alice
version: 1.0.0
about: Brief description
license: CC0
---
```

Access via `@fm`:

```mlld
var @id = @fm.id
var @version = @fm.version

>> Build a metadata object
var @meta = {
  id: @fm.id,
  name: @fm.name,
  version: @fm.version
}
```
