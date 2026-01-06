---
id: security-denied-handlers
title: Denied Handlers
brief: Handle denied operations gracefully
category: security
parent: guards
tags: [security, guards, error-handling, denied]
related: [security-guards-basics, exe-when-first]
related-code: [interpreter/eval/guard.ts, interpreter/eval/denied.ts]
updated: 2026-01-05
---

**Handle denied operations gracefully:**

```mlld
exe @handler(value) = when [
  denied => `Blocked: @mx.guard.reason`
  * => @value
]
```
