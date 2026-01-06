---
id: security-automatic-labels
title: Automatic Labels
brief: System-assigned labels for tracking
category: security
parent: labels
tags: [security, labels, automatic, tracking]
related: [security-guards-basics, security-label-tracking]
related-code: [core/security/AutomaticLabels.ts]
updated: 2026-01-05
---

**System-assigned labels for tracking:**

| Label | Applied To |
|-------|------------|
| `src:exec` | Results from `/run` and `/exe` |
| `src:file` | File loads |
| `src:dynamic` | Dynamic module imports |
| `dir:/path` | File directories (all parents) |

**Example directory guards:**

```mlld
guard before op:run = when [
  @input.any.mx.taint.includes('dir:/tmp/uploads') =>
    deny "Cannot execute uploaded files"
  * => allow
]
```
