---
id: config-frontmatter
title: Frontmatter
brief: Document metadata at file start
category: configuration
parent: configuration
tags: [configuration, frontmatter, metadata]
related: [modules-creating, modules-frontmatter-access]
related-code: [core/frontmatter/Parser.ts]
updated: 2026-01-05
---

Document metadata at file start.

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
```
