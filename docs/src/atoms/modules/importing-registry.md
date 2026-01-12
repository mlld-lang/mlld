---
id: modules-importing-registry
title: Importing Registry Modules
brief: Import from the public mlld registry
category: modules
parent: importing
tags: [modules, imports, registry, versioning]
related: [modules-importing-local, modules-registry]
related-code: [interpreter/eval/import.ts, core/registry/RegistryResolver.ts]
updated: 2026-01-05
qa_tier: 2
---

**Registry modules:**

```mlld
import { @parallel, @retry } from @mlld/core
import @corp/utils as @corp

>> With version
import { @helper } from @alice/utils@1.0.0
import { @helper } from @alice/utils@^1.0.0   >> semver range
```
