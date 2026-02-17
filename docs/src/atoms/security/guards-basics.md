---
id: security-guards-basics
title: Guards Basics
brief: Protect data and operations with guards
category: security
parent: guards
aliases: [guard]
tags: [security, guards, labels, policies]
related: [security-before-guards, security-after-guards, labels-overview]
related-code: [interpreter/eval/guard.ts, core/security/Guard.ts]
updated: 2026-01-05
qa_tier: 2
---

**Operation guards** block labeled data at trust boundaries:

```mlld
guard before op:run = when [
  @input.any.mx.labels.includes("secret") => deny "Secrets blocked from shell"
  @mx.taint.includes("src:mcp") => deny "MCP data cannot reach shell"
  * => allow
]
```

**Guard syntax:**

```
guard [@name] TIMING TRIGGER = when [...]
```

- `TIMING`: `before`, `after`, or `always` (`for` is shorthand for `before`)
- `TRIGGER`: `op:TYPE` for operations, `LABEL` for data validation

**Two trigger types:**

| Form | Fires when | Frequency | `denied` handler |
|---|---|---|---|
| `before op:TYPE` | Operation executes | Every matching operation | Yes |
| `before LABEL` / `for LABEL` | Labeled data created | Once per labeled value | Not applicable |

Operation guards are the primary security mechanism — they enforce label-based flow control at runtime. Label-entry guards (`before LABEL`) validate or sanitize data at creation time; see `before-guards` for that pattern.

**Security context in guards:**

Guards have access to three complementary dimensions:

- `@mx.labels` - semantic classification (what it is): `secret`, `pii`, `untrusted`
- `@mx.taint` - provenance (where it came from): `src:mcp`, `src:exec`, `src:file`
- `@mx.sources` - transformation trail (how it got here): `mcp:createIssue`, `command:curl`
- `@mx.op.labels` - operation labels, including tool labels like `destructive` or `net:w`

**Guard Context Reference:**

| Guard type | `@input` | `@output` | `@mx` highlights |
|---|---|---|---|
| `before op:TYPE` | Array of operation inputs | String view of the first input | `@mx.op.type`, `@mx.op.name`, `@mx.op.labels`, `@mx.guard.try` |
| `after op:TYPE` | Array of operation outputs in the current guard scope | String view of the current output | `@mx.op.*`, `@mx.guard.try`, `@mx.guard.reasons`, `@mx.guard.hintHistory` |
| `before LABEL` | The current labeled value (`string`, `object`, `array`, etc.) | String view of the current value | `@mx.labels`, `@mx.taint`, `@mx.sources`, `@mx.guard.try`, `@mx.guard.timing` |

Operation guard inputs expose helper metadata for aggregate checks:

- `@input.any.mx.labels.includes("secret")`
- `@input.all.mx.taint.includes("src:file")`
- `@input.none.mx.labels.includes("pii")`
- `@input.mx.labels`, `@input.mx.taint`, `@input.mx.sources`
- `@input.any.text.includes("SSN")` for content-level text inspection

Use labels to classify data types, taint to track untrusted origins, and sources for audit trails:

```mlld
guard before op:run = when [
  @mx.taint.includes("src:mcp") => deny "Cannot execute MCP data"
  @mx.labels.includes("secret") => deny "Secrets blocked from shell"
  * => allow
]
```

Tool labels flow into guard context for executable operations:

```mlld
guard @blockDestructive before op:exe = when [
  @mx.op.labels.includes("destructive") => deny "Blocked"
  * => allow
]
```
