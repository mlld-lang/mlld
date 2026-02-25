---
id: modules-importing-local
title: Importing Local Files
brief: Import from local filesystem paths
category: modules
parent: importing
aliases: [import]
tags: [modules, imports, local, files]
related: [modules-importing-registry, modules-importing-namespace]
related-code: [interpreter/eval/import.ts, core/resolvers/LocalResolver.ts]
updated: 2026-01-05
qa_tier: 2
---

**Local files (selected exports):**

```mlld
import { @helper } from "./utils.mld"
import { @config } from <@root/config.mld>
import { @prompt } from "../prompts/main.mld"

import {
  @renderHeader,
  @renderBody
} from "./templates.mld"
```

**Local files (namespace import):**

```mlld
import "./utils.mld" as @utils
show @utils.helper("report")
```

**Path resolution:**
- `./` and `../` paths resolve from the importing file's directory, not the shell cwd.
- `<@root/...>` resolves from the project root.
