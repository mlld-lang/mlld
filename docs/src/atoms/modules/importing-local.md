---
id: modules-importing-local
title: Importing Local Files
brief: Import from local filesystem paths
category: modules
parent: importing
tags: [modules, imports, local, files]
related: [modules-importing-registry, modules-importing-namespace]
related-code: [interpreter/eval/import.ts, core/resolvers/LocalResolver.ts]
updated: 2026-01-05
qa_tier: 2
---

**Local files:**

```mlld
import { @helper } from "./utils.mld"
import { @config } from <@base/config.mld>
import { @prompt } from "../prompts/main.mld"
```
