---
id: modules-importing-directory
title: Directory Imports
brief: Import entire directories as namespaced modules
category: modules
parent: importing
tags: [modules, imports, directory, namespace]
related: [modules-importing-namespace, modules-importing-local]
related-code: [interpreter/eval/import.ts, core/resolvers/DirectoryResolver.ts]
updated: 2026-01-05
---

**Directory imports:**

```mlld
import "@agents" as @agentRegistry
show @agentRegistry.alice.tldr
show @agentRegistry.support.helper.name

>> With options
import "./agents" as @agents with { skipDirs: [] }
```

Directories auto-load `*/index.mld`. Default `skipDirs: ["_*", ".*"]`.
