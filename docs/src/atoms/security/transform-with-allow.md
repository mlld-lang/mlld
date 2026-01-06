---
id: security-transform-allow
title: Transform with Allow
brief: Transform data during guard evaluation
category: security
parent: guards
tags: [security, guards, transform, redaction]
related: [security-before-guards, security-guards-basics]
related-code: [interpreter/eval/guard.ts, core/security/Transform.ts]
updated: 2026-01-05
---

**Transform data during guard evaluation:**

```mlld
guard @redact before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]
```
