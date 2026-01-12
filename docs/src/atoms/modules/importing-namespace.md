---
id: modules-importing-namespace
title: Namespace Imports
brief: Import modules with namespace aliases
category: modules
parent: importing
tags: [modules, imports, namespace, collision]
related: [modules-importing-registry, modules-importing-local]
related-code: [interpreter/eval/import.ts, interpreter/env/Namespace.ts]
updated: 2026-01-05
---

**Namespace imports:**

```mlld
import @alice/utils as @alice
import @bob/utils as @bob

show @alice.format(@data)
show @bob.format(@data)   >> no collision
```
