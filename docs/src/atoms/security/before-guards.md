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

| Guard form | Trigger moment | Frequency | `denied` handler |
|---|---|---|---|
| `before op:TYPE` | Right before an operation executes | Every operation attempt | Yes (`denied => ...`) |
| `before LABEL` / `for LABEL` | When labeled data is created | Once per labeled value | Not applicable |

**Operation guards** — block or transform at trust boundaries:

```mlld
guard @runGate before op:run = when [
  @input.any.mx.labels.includes("secret") => deny "Secrets cannot flow to run"
  * => allow
]

exe @safe(value) = when [
  denied => `[blocked] @mx.guard.reason`
  * => @value
]
```

Operation type matching is hierarchical: `before op:cmd:git` matches `op:cmd:git:push`, `op:cmd:git:status`, etc.

When multiple `before` guards return `allow @value`, the operation receives the replacement from the last matching guard in declaration order.

**Data validation guards** — validate or sanitize at label-entry time:

```mlld
guard @validateSecret before secret = when [
  @input.length < 8 => deny "Secret is too short"
  * => allow
]

guard @sanitize before untrusted = when [
  * => allow @input.trim().slice(0, 100)
]
```

These fire when data receives a label, before any operation context exists. `denied` handlers cannot catch these denials — they're creation-time validation, not flow control.
