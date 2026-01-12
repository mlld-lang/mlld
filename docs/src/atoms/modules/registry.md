---
id: modules-registry
title: Module Registry
brief: Publishing and installing from the public registry
category: modules
parent: modules
tags: [modules, registry, publishing, installing]
related: [modules-importing-registry, modules-creating]
related-code: [cli/commands/publish.ts, cli/commands/install.ts]
updated: 2026-01-05
---

**Publishing:**

```bash
mlld publish my-tool.mld.md             # first time creates PR
mlld publish my-tool.mld.md             # updates publish directly
mlld publish --tag beta my-tool.mld.md  # with tag
```

**Installing:**

```bash
mlld install @alice/utils
mlld install @alice/utils@1.0.0
mlld update @alice/utils
mlld ls                                  # list installed
```

**Lock files:**
- `mlld-lock.json` auto-generated
- Commit to version control
- Only registry modules validated
