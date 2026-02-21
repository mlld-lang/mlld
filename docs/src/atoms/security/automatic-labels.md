---
id: security-automatic-labels
title: Automatic Labels
brief: System-assigned labels for tracking
category: security
parent: labels
tags: [security, labels, automatic, tracking]
related: [security-guards-basics, security-label-tracking]
related-code: [core/security/LabelTracker.ts]
updated: 2026-01-05
qa_tier: 2
---

| Label | Applied To |
|-------|------------|
| `src:cmd` | Output from `cmd { }` blocks |
| `src:sh` | Output from `sh { }` blocks |
| `src:js` | Output from `js { }` blocks |
| `src:py` | Output from `py { }` blocks |
| `src:template` | Output from `template` executables |
| `src:exe` | Output from pure mlld executables (no code block) |
| `src:file` | File loads |
| `src:mcp` | MCP tool call results |
| `src:user` | User input (via `@input` resolver) |
| `src:network` | Network fetches |
| `src:keychain` | Values from the keychain |
| `src:dynamic` | Dynamic module imports |
| `src:env:<provider>` | Environment provider outputs |
| `dir:/path` | File directories (all parents) |

**Example directory guards:**

```mlld
guard before op:run = when [
  @input.any.mx.taint.includes('dir:/tmp/uploads') =>
    deny "Cannot execute uploaded files"
  * => allow
]
```
