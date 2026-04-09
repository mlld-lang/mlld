---
id: security-guards-basics
title: Guards Basics
brief: Protect data and operations with guards
category: effects
parent: guards
aliases: [guard]
tags: [security, guards, labels, policies]
related: [labels-overview, labels-attestations, security-guard-composition, security-denied-handlers]
related-code: [interpreter/eval/guard.ts, core/security/Guard.ts]
updated: 2026-04-07
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
- `@mx.attestations` - value-scoped approvals such as `known` and `known:*`
- `@mx.sources` - transformation trail (how it got here): `mcp:createIssue`, `command:curl`
- `@mx.op.labels` - operation labels, including exe labels like `destructive` or `net:w`

**Guard Context Reference:**

| Guard scope | `@input` | `@output` | `@mx` highlights |
|---|---|---|---|
| per-operation | Array of operation inputs | String view of the first input | `@mx.op.type`, `@mx.op.name`, `@mx.op.labels`, `@mx.args.*`, `@mx.guard.try` |
| per-operation (after) | Array of operation outputs in the current guard scope | String view of the current output | `@mx.op.*`, `@mx.args.*`, `@mx.guard.try`, `@mx.guard.reasons`, `@mx.guard.hintHistory` |
| per-input | The current labeled value (`string`, `object`, `array`, etc.) | String view of the current value | `@mx.op.*`, `@mx.args.*`, `@mx.labels`, `@mx.taint`, `@mx.sources`, `@mx.guard.try` |

Per-operation guards can access individual arguments by index:

- `@input[0]`, `@input[1]`, etc. — individual argument values
- `@input[0].mx.labels`, `@input[0].mx.taint`, `@input[0].mx.attestations` — per-arg security metadata

Per-operation and per-input guards can also access named operation inputs through `@mx.args`:

- `@mx.args.value` — named arg access for identifier-safe parameter names
- `@mx.args.value.mx.labels`, `@mx.args.value.mx.taint`, `@mx.args.value.mx.attestations` — per-arg metadata by name
- `@mx.args["repo-name"]` — bracket access for names that are not dot-safe
- `@mx.args.names` — list of available arg names
- `@mx.args["names"]` — access an actual arg named `names` even though `@mx.args.names` is reserved

Per-operation guard inputs also expose helper metadata for aggregate checks:

- `@input.any.mx.labels.includes("secret")`
- `@input.all.mx.taint.includes("src:file")`
- `@input.any.mx.attestations.includes("known")`
- `@input.none.mx.labels.includes("pii")`
- `@input.mx.labels`, `@input.mx.taint`, `@input.mx.attestations`, `@input.mx.sources`
- `@input.any.text.includes("SSN")` for content-level text inspection

**Per-arg label inspection:**

```mlld
>> Check whether the first argument to an exe is labeled 'secret'
guard before op:exe = when [
  @input[0].mx.labels.includes("secret") => deny "First argument must not be secret"
  * => allow
]
```

```mlld
>> Check whether a named argument is labeled 'secret'
guard before op:exe = when [
  @input.length() > 0 && @mx.args.value.mx.labels.includes("secret") => deny "Named arg must not be secret"
  * => allow
]
```

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

After guards validate or transform operation output. Four actions:

| Action | What happens |
|---|---|
| `allow` | Proceed with the output |
| `deny` | Block the operation |
| `retry` | Re-execute the entire exe from scratch |
| `resume` | Append a message to the LLM conversation, get a new response (no tool re-execution or new tool calls) |

```mlld
guard @validateJson after op:exe = when [
  @isValidJson(@output) => allow
  * => deny "Invalid JSON"
]
```

`resume` is for LLM exes that called write tools and then produced malformed output. Unlike `retry`, `resume` continues the existing conversation — the LLM sees its prior tool calls and results, plus the correction message. No tools re-fire, no new tools are exposed, and auto-provisioned `@shelve` is disabled for the resumed call. That makes resume final-output repair only, not a chance to redo tool work. See the [resume invariants](#resume-invariants) section below.

```mlld
guard after @fixShape for op:named:myWorker = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => resume "Return valid JSON. Errors: @output.mx.schema.errors"
  @output.mx.schema.valid == false => deny "Still invalid"
  * => allow
]
```

### Resume invariants

A resumed call runs with two structural restrictions:

- **`tools = []`** — the user-supplied tool list is forced empty for the resumed turn.
- **`disableAutoProvisionedShelve: true`** — the auto-provisioned shelve tool from writable shelf scope is also dropped from the resumed call.

Both are load-bearing for handle safety, not just convenience. Handles are minted per call: each LLM invocation has its own mint table that dies when the call ends. The conversation history that resume replays still contains handle strings from the prior turn, but those handles are dead by the time the resume runs — their mint table belongs to the original call.

If the resumed call could fire tools or shelve writes, the LLM might paste a handle from the prior turn into a fresh tool call. That handle would not resolve, and the dispatch would either deny outright or — worse, if any path were lenient — match a different value than the LLM intended. Forcing `tools = []` and disabling auto-provisioned shelve eliminates the failure mode at the structural level.

What this means semantically: **resume fixes the LLM's text or JSON output, not its tool calls.** Use it when the model called the right tools but produced malformed final text. If you want the LLM to take more actions, that is a new step in the orchestration loop — not a resume. Use `retry` (which starts a fresh call with a fresh mint table) if you want to re-attempt the entire operation, but be careful: `retry` re-fires write tools, so it is dangerous for exes that send email, create issues, or otherwise have side effects.

To inspect resume state from a guard or post-call code, read `@mx.llm.resume`. It returns `null` outside a resumed call and a structured object (`{ sessionId, provider, continuationOf, attempt }`) when the current call is a resume continuation. Useful for guards that need to behave differently on the second pass, or for tests that verify a resume actually fired the expected number of times. See `builtins-ambient-mx`.

| Situation | Action |
|---|---|
| Read-only exe with malformed output | `retry` is fine |
| Write-tool exe with malformed final text | `resume` |
| Write-tool exe needs to re-attempt the writes themselves | Not a guard concern — restart the orchestration step |

When multiple guards disagree: `deny > resume > retry > allow`.

After-guard transforms chain sequentially in declaration order — each matching guard receives the output from the previous guard. `resume` is rejected if an earlier guard already transformed the output. See `guard-composition` for the full resolution model.
