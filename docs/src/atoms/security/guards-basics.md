---
id: security-guards-basics
title: Guards Basics
brief: Protect data and operations with guards
category: security
parent: guards
aliases: [guard]
tags: [security, guards, labels, policies]
related: [security-before-guards, security-after-guards, security-labels]
related-code: [interpreter/eval/guard.ts, core/security/Guard.ts]
updated: 2026-01-05
qa_tier: 2
---

**Labeling data:**

```mlld
var secret @apiKey = "sk-12345"
var pii @email = "user@example.com"
```

**Defining guards:**

```mlld
guard @noShellSecrets before secret = when [
  @mx.op.type == "run" => deny "Secrets blocked from shell"
  * => allow
]

run cmd { echo @apiKey }   >> Blocked by guard
```

**Guard syntax:**

```
guard [@name] TIMING LABEL = when [...]
```

- `TIMING`: `before`, `after`, or `always`
- Shorthand: `for` equals `before`

**`before` timing comparison:**

| Form | Trigger moment | Frequency | `denied` handler support |
|---|---|---|---|
| `before LABEL` / `for LABEL` | Labeled value creation | Once per labeled value | No |
| `before op:TYPE` | Operation execution | Every operation attempt | Yes |

`before LABEL` denials happen before an operation exists, so `denied => ...` handlers do not run for that case.

**Security context in guards:**

Guards have access to three complementary dimensions:

- `@mx.labels` - semantic classification (what it is): `secret`, `pii`, `untrusted`
- `@mx.taint` - provenance (where it came from): `src:mcp`, `src:exec`, `src:file`
- `@mx.sources` - transformation trail (how it got here): `mcp:createIssue`, `command:curl`
- `@mx.op.labels` - operation labels, including tool labels like `destructive` or `net:w`

**Guard Context Reference:**

| Guard type | `@input` | `@output` | `@mx` highlights |
|---|---|---|---|
| `before LABEL` | The current labeled value (`string`, `object`, `array`, etc.) | String view of the current value | `@mx.labels`, `@mx.taint`, `@mx.sources`, `@mx.guard.try`, `@mx.guard.timing` |
| `before op:TYPE` | Array of operation inputs | String view of the first input | `@mx.op.type`, `@mx.op.name`, `@mx.op.labels`, `@mx.guard.try` |
| `after op:TYPE` | Array of operation outputs in the current guard scope | String view of the current output | `@mx.op.*`, `@mx.guard.try`, `@mx.guard.reasons`, `@mx.guard.hintHistory` |

Operation guard inputs expose helper metadata for aggregate checks:

- `@input.any.mx.labels.includes("secret")`
- `@input.all.mx.taint.includes("src:file")`
- `@input.none.mx.labels.includes("pii")`
- `@input.mx.labels`, `@input.mx.taint`, `@input.mx.sources`
- `@input[0]` for first input value checks (for example `@input[0].includes("sk-")`)

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
