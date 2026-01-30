---
id: modules-updating
title: Updating Modules
brief: Check for and install module updates
category: modules
parent: modules
tags: [modules, registry, updating, versions]
related: [modules-registry, modules-importing-registry]
related-code: [cli/commands/registry.ts, cli/commands/install.ts]
updated: 2026-01-30
---

**Check installed modules:**

```bash
mlld ls                          # list all installed modules with versions
```

**Update a specific module:**

```bash
mlld update @alice/utils         # fetch latest version
```

**Update all modules:**

```bash
mlld update                      # updates everything in mlld-lock.json
```

**Check module info:**

```bash
mlld registry info @alice/utils  # show module details from registry
```

**Version pinning:**

The lock file (`mlld-lock.json`) tracks installed versions:
- `version: "latest"` - updates to newest on `mlld update`
- `version: "1.2.0"` - stays pinned until manually changed

**After updating:**

Verify new exports are available:
```bash
mlld validate your-file.mld      # check imports resolve
```
