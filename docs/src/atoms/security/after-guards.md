---
id: security-after-guards
title: After Guards
brief: Validate output after operations
category: security
parent: guards
tags: [security, guards, validation, output]
related: [security-guards-basics, security-before-guards]
related-code: [interpreter/eval/guard.ts, core/security/AfterGuard.ts]
updated: 2026-01-05
---

**Validate output after operations:**

```mlld
guard @validateJson after op:exe = when [
  @isValidJson(@output) => allow
  * => deny "Invalid JSON"
]
```
