---
id: security-before-guards
title: Before Guards
brief: Validate or transform input before operations
category: security
parent: guards
tags: [security, guards, validation, input]
related: [security-guards-basics, security-after-guards, security-transform]
related-code: [interpreter/eval/guard.ts, core/security/BeforeGuard.ts]
updated: 2026-01-05
---

**Validate or transform input before operations:**

```mlld
guard @sanitize before untrusted = when [
  * => allow @input.trim().slice(0, 100)
]
```
