---
id: security-denied-handlers
title: Denied Handlers
brief: Handle denied operations gracefully
category: security
parent: guards
tags: [security, guards, denied, error-handling]
related: [security-guards-basics, when]
related-code: [interpreter/eval/guard.ts, interpreter/eval/when.ts]
updated: 2026-02-17
qa_tier: 2
---

The `denied` keyword is a when-condition that tests if we're in a denied context. Use it to handle guard denials gracefully.

- `deny "reason"` — guard action that blocks an operation
- `denied` — when-condition that matches inside a denied handler

```mlld
guard before op:run = when [
  @input.any.mx.labels.includes("secret") => deny "Secrets blocked from shell"
  * => allow
]

exe @safe(value) = when [
  denied => `[blocked] @mx.guard.reason`
  * => @value
]
```

`denied` handlers catch denials from guards in both per-operation and per-input scope. When a guard denies an operation, the exe's `when` block can match `denied` and provide a fallback value.

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
