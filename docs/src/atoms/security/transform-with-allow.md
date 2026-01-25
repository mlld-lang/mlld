---
id: security-transform-with-allow
title: Transform with Allow
brief: Transform data during guard evaluation
category: security
parent: guards
tags: [security, guards, transform, allow]
related: [security-guards-basics, security-before-guards]
related-code: [interpreter/eval/guard.ts]
updated: 2026-01-05
qa_tier: 2
---

```mlld
guard @redact before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]
```
