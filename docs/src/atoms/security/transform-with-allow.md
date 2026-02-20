---
id: security-transform-with-allow
title: Transform with Allow
brief: Transform data during guard evaluation
category: security
parent: guards
tags: [security, guards, transform, allow]
related: [security-guards-basics]
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

`allow @value` replaces the guarded value:
- In `before` phase, replacements read from `@input`.
- In `after` phase, replacements read from `@output`.

For `before op:exe`, write transforms against `@input` (for example method calls or helper executables) so input conversion stays explicit.

When multiple `before` transforms match, the last replacement becomes operation input. `after` transforms chain in declaration order.
