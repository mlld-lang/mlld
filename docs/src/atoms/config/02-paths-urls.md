---
id: paths-urls
qa_tier: 2
title: Paths and URLs
brief: Literal, interpolated, and remote paths
category: config
tags: [configuration, paths, urls, files]
related: [file-loading-basics, modules-importing-local, resolvers, builtins-reserved-variables]
related-code: [core/resolvers/PathResolver.ts, core/resolvers/URLResolver.ts]
updated: 2026-01-05
---

Paths can be literal, interpolated, or resolver-based.

```mlld
var @dir = "./docs"
var @userFile = "data/@username/profile.json"
var @template = 'templates/@var.html'  >> literal '@'

>> URLs as sources
show <https://raw.githubusercontent.com/org/repo/main/README.md>
var @remote = <https://example.com/README.md>
```

**`@root` resolution**: `@root` (alias: `@base`) resolves to the project root by walking up from the current file's directory looking for `mlld-config.json`, `mlld-lock.json`, `package.json`, `.git`, or similar project markers. Use `<@root/path>` for project-absolute paths. See `mlld howto builtins-reserved-variables` for the full resolution algorithm.
