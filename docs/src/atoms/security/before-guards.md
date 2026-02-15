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
qa_tier: 2
---

`before` guards use two trigger styles with different timing:

| Guard form | Trigger moment | Frequency | `denied` handler scope |
|---|---|---|---|
| `before LABEL` (or `for LABEL`) | When labeled data is created | Once per labeled value | Not available (operation context does not exist yet) |
| `before op:TYPE` | Right before an operation executes | Every operation attempt | Available (`denied => ...` can catch it) |

Use `before LABEL` for data-entry policy and `before op:TYPE` for per-operation policy.

```mlld
guard @labelGate before secret = when [
  @input.length < 8 => deny "Secret is too short"
  * => allow
]

guard @runGate before op:run = when [
  @input.includes("sk-") => deny "Secrets cannot flow to run"
  * => allow
]

exe @safe(value) = when [
  denied => `[blocked] @mx.guard.reason`
  * => @value
]

guard @sanitize before untrusted = when [
  * => allow @input.trim().slice(0, 100)
]
```

When multiple `before` guards return `allow @value`, the operation receives the replacement from the last matching guard in declaration order.
