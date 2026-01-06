---
id: security-denied-handlers
title: Denied Handlers
brief: Handle denied operations gracefully
category: security
parent: guards
tags: [security, guards, denied, error-handling]
related: [security-guards-basics, when-simple]
related-code: [interpreter/eval/guard.ts]
updated: 2026-01-05
---

```mlld
exe @handler(value) = when [
  denied => `Blocked: @mx.guard.reason`
  * => @value
]
```
