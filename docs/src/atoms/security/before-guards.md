---
id: security-before-guards
title: Before Guards
brief: Validate or transform input before operations
category: security
parent: guards
tags: [security, guards, input, validation]
related: [security-guards-basics, security-after-guards]
related-code: [interpreter/eval/guard.ts]
updated: 2026-01-05
---

```mlld
guard @sanitize before untrusted = when [
  * => allow @input.trim().slice(0, 100)
]
```
