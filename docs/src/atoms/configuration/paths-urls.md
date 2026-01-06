---
id: config-paths-urls
title: Paths and URLs
brief: Literal, interpolated, and remote paths
category: configuration
parent: configuration
tags: [configuration, paths, urls, files]
related: [file-loading-basics, modules-importing-local]
related-code: [core/resolvers/PathResolver.ts, core/resolvers/URLResolver.ts]
updated: 2026-01-05
---

**Paths can be literal, interpolated, or resolver-based:**

```mlld
var @dir = "./docs"
var @userFile = "data/@username/profile.json"
var @template = 'templates/@var.html'  >> literal '@'

>> URLs as sources
show <https://raw.githubusercontent.com/org/repo/main/README.md>
var @remote = <https://example.com/README.md>
```
