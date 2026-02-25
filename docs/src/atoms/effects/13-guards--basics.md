---
id: security-guards-basics
title: Guards Basics
brief: Protect data and operations with guards
category: security
parent: guards
aliases: [guard]
tags: [security, guards, labels, policies]
related: [labels-overview, security-guard-composition, security-denied-handlers]
related-code: [interpreter/eval/guard.ts, core/security/Guard.ts]
updated: 2026-02-17
qa_tier: 2
---

Guards block labeled data at trust boundaries:

```mlld
guard before secret = when [
  @mx.op.labels.includes("net:w") => deny "Secrets cannot flow to network operations"
  * => allow
]
```

**Guard syntax:**

```
guard [@name] TIMING TRIGGER = when [...]
```

- `TIMING`: `before`, `after`, or `always` (`for` is shorthand for `before`)
- `TRIGGER`: a label — matches wherever that label appears (on input data, on operations, or both). Use the `op:` prefix to narrow to operation-only matching.

**How triggers match:**

A guard trigger is a label. It matches wherever that label appears:

| Match source | Scope | `@input` | When it fires |
|---|---|---|---|
| Data label on an input | per-input | The individual labeled variable | Each input with that label |
| Operation label (exe label) | per-operation | Array of all operation inputs | Once per matching operation |

```mlld
>> Matches input data with the 'secret' label AND exes labeled 'secret'
guard before secret = when [...]

>> Matches ONLY exes/operations labeled 'exfil' (narrowed with op:)
guard before op:exfil = when [...]
```

The `op:` prefix is for disambiguation — use it when you want operation-only matching. For most guards, bare labels are simpler and match both contexts.

**Security context in guards:**

All guards have access to the full operation context:

- `@mx.labels` - semantic classification (what it is): `secret`, `pii`, `untrusted`
- `@mx.taint` - provenance (where it came from): `src:mcp`, `src:cmd`, `src:js`, `src:file`
- `@mx.sources` - transformation trail (how it got here): `mcp:createIssue`, `command:curl`
- `@mx.op.labels` - operation labels, including exe labels like `destructive` or `net:w`

**Guard Context Reference:**

| Guard scope | `@input` | `@output` | `@mx` highlights |
|---|---|---|---|
| per-operation | Array of operation inputs | String view of the first input | `@mx.op.type`, `@mx.op.name`, `@mx.op.labels`, `@mx.guard.try` |
| per-operation (after) | Array of operation outputs in the current guard scope | String view of the current output | `@mx.op.*`, `@mx.guard.try`, `@mx.guard.reasons`, `@mx.guard.hintHistory` |
| per-input | The current labeled value (`string`, `object`, `array`, etc.) | String view of the current value | `@mx.op.*`, `@mx.labels`, `@mx.taint`, `@mx.sources`, `@mx.guard.try` |

Per-operation guard inputs expose helper metadata for aggregate checks:

- `@input.any.mx.labels.includes("secret")`
- `@input.all.mx.taint.includes("src:file")`
- `@input.none.mx.labels.includes("pii")`
- `@input.mx.labels`, `@input.mx.taint`, `@input.mx.sources`
- `@input.any.text.includes("SSN")` for content-level text inspection

**Two ways to guard the same flow:**

You can guard from the data side or the operation side — both work:

```mlld
>> Approach 1: Guard on the data label, check the operation
guard before secret = when [
  @mx.op.labels.includes("net:w") => deny "Secrets cannot flow to network operations"
  * => allow
]

>> Approach 2: Guard on the operation label, check the data
guard before net:w = when [
  @input.any.mx.labels.includes("secret") => deny "Secrets cannot flow to network operations"
  * => allow
]
```

Both prevent `secret` data from reaching `net:w` operations. Choose whichever reads more naturally for your use case.

**Hierarchical operation matching:**

Operation type matching with `op:` is hierarchical: `before op:cmd:git` matches `op:cmd:git:push`, `op:cmd:git:status`, etc.

**Per-input validation and transformation:**

Per-input guards can validate or sanitize data by label:

```mlld
guard @validateSecret before secret = when [
  @input.length < 8 => deny "Secret is too short"
  * => allow
]

guard @sanitize before untrusted = when [
  * => allow @input.trim().slice(0, 100)
]
```

Per-input guards run in full operation context — use `@mx.op.type`, `@mx.op.labels`, etc. to check what operation the labeled data is flowing into:

```mlld
guard @redact before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]
```

**After guards:**

After guards validate or transform operation output:

```mlld
guard @validateJson after op:exe = when [
  @isValidJson(@output) => allow
  * => deny "Invalid JSON"
]
```

After-guard transforms chain sequentially in declaration order — each matching guard receives the output from the previous guard. See `guard-composition` for the full resolution model.
