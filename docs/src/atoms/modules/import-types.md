---
id: modules-import-types
title: Import Types
brief: Control caching and resolution behavior
category: modules
parent: importing
tags: [modules, imports, caching, types]
related: [modules-importing-registry, modules-importing-local]
related-code: [interpreter/eval/import.ts, core/resolvers/ImportTypeResolver.ts]
updated: 2026-01-05
---

| Type | Behavior | Use Case |
|------|----------|----------|
| `module` | Content-addressed cache | Registry modules (default) |
| `static` | Embedded at parse time | Prompts, templates |
| `live` | Always fresh | Status APIs |
| `cached(TTL)` | Time-based cache | Feeds, configs |
| `local` | Dev modules (llm/modules/) | Development |
| `templates` | Directory of .att files | Template collections |

```mlld
import module { @api } from @corp/tools
import static { @prompt } from "./prompt.md"
import live <https://status.io> as @status
import cached(1h) <https://feed.xml> as @feed
import local { @dev } from @alice/experimental
```
