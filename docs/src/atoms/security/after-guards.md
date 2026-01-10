---
id: security-after-guards
title: After Guards
brief: Validate output after operations
category: security
parent: guards
tags: [security, guards, output, validation]
related: [security-guards-basics, security-before-guards]
related-code: [interpreter/eval/guard.ts]
updated: 2026-01-05
---

```mlld
guard @validateJson after op:exe = when [
  @isValidJson(@output) => allow
  * => deny "Invalid JSON"
]
```
