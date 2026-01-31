---
id: security-denied-handlers
title: Denied Handlers
brief: Handle denied operations gracefully
category: security
parent: guards
tags: [security, guards, denied, error-handling]
related: [security-guards-basics, when]
related-code: [interpreter/eval/guard.ts, interpreter/eval/when.ts]
updated: 2026-01-31
qa_tier: 2
---

The `denied` keyword is a when-condition that tests if we're in a denied context. Use it to handle guard denials gracefully.

**`deny` vs `denied`:**

- `deny "reason"` - Guard action that blocks an operation
- `denied` - When condition that matches inside a denied handler

```mlld
guard before secret = when [
  @mx.op.type == "run" => deny "Secrets blocked from shell"
  * => allow
]

exe @safe(value) = when [
  denied => `[blocked] @mx.guard.reason`
  * => @value
]
```

**Accessing guard context:**

```mlld
exe @handler(value) = when [
  denied => show "Blocked: @mx.guard.reason"
  denied => show "Guard: @mx.guard.name"
  denied => show "Labels: @mx.labels.join(', ')"
  * => show @value
]
```

**Negating denied:**

```mlld
exe @successOnly(value) = when [
  !denied => @value
]
```
