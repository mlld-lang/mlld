---
id: modules-local-development
title: Local Development Modules
brief: Dev modules in llm/modules/ directory
category: modules
parent: modules
tags: [modules, development, local]
related: [modules-import-types, modules-importing-local]
related-code: [core/resolvers/LocalModuleResolver.ts]
updated: 2026-01-05
---

```
llm/modules/
├── my-utils.mld.md    # author: alice, name: experimental
└── helpers.mld        # author: bob, name: tools
```

```mlld
import local { @helper } from @alice/experimental
```

Matched by frontmatter `author` and `name` fields.
