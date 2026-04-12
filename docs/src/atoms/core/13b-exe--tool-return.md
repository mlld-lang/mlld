---
id: exe-tool-return
title: Exe Tool Return (`->` and `=->`)
brief: Return different values to mlld code vs. LLM tool callers
category: core
parent: exe
tags: [return, tool-dispatch, agents, security]
related: [script-return, exe-blocks, exe-metadata, pattern-planner, tool-docs, facts-and-handles]
related-code: [grammar/generated/parser/parser.ts, interpreter/eval/exe/block-execution.ts, interpreter/eval/exec-invocation.ts]
updated: 2026-04-11
qa_tier: 2
---

An exe can return one value to mlld code that called it and a different value to an LLM that called it as a tool. The two return channels are `=>` (mlld-canonical) and `->` (LLM-facing).

This matters when an exe has two different consumers:

- the canonical mlld/runtime path, which often wants a domain record or full internal result
- the LLM tool caller, which may need either the same projected domain result or a deliberately different planner-facing envelope

In practice this yields two common secure patterns:

- **canonical record return for domain data** — `=> @value as record @Type`, `=> record @schema`, or `=> @cast(@value, @schema)` so the bridge applies the active `role:*` display projection
- **explicit `->` return for differentiated planner-facing results** — status, counts, summaries, or a planner-specific object that intentionally differs from the canonical return

No session protocol, no callbacks — just two return paths from a single function.

## The three sigils

| Sigil | Writes to | Returns? | Meaning |
|---|---|---|---|
| `=>` | canonical slot | yes (early return) | mlld-canonical — what `var @r = @exe(...)` binds to |
| `->` | tool slot | no (passive slot write) | LLM-facing — what an LLM sees as the tool result |
| `=->` | both slots | yes (early return) | "both consumers see this value" — the dual sigil |

`=>` and `->` are not two flavors of the same thing. They are two different relationships between the exe and its consumers. `=->` is a convenience sigil for the common "both consumers see this value" case.

## Basic usage

```mlld
exe @sendEmail(recipient, subject, body) = [
  let @result = run cmd { email-cli send --to @recipient --subject @subject --body @body }
  let @parsed = @result | @parse
  -> { status: "sent", recipient: @recipient }
  => { ok: true, message_id: @parsed.id, full_response: @parsed }
]

>> Called from mlld code — binds the `=>` value:
var @r = @sendEmail("alice@example.com", "hi", "body")
>> @r is { ok: true, message_id: "...", full_response: {...} }

>> Called as a tool by an LLM — LLM sees the `->` value:
@claude("Email alice", { tools: [@sendEmail] })
>> The LLM receives { status: "sent", recipient: "alice@example.com" } as the tool result
```

**Ordering matters.** `=>` terminates the block; `->` is a passive write that continues execution. When using both, `->` MUST come before `=>`. The parser rejects `=>` followed by `->` with a clear diagnostic ("Unreachable tool return in exe block").

## Strict mode

**If the exe source contains ANY `->` or `=->`, the exe is in strict mode.** In strict mode:

- Tool dispatch ALWAYS uses the tool slot. The runtime does NOT fall back to the `=>` value if no `->` was reached at runtime.
- If no `->` reach happens (e.g., the `->` was in an unreached branch), the tool slot resolves per the multi-reach polymorphism rule (see below) — NOT to the `=>` value.
- mlld code calling the exe still uses the `=>` slot as before. Strict mode only affects what LLMs see as tool results.

**Why strict mode matters.** Without it, this code has a security hole:

```mlld
exe @gate(req) = [
  if @req.flagged [
    -> { status: "blocked", reason: @req.flag_reason }
  ]
  => @req.full_internal_state
]
```

A developer might think they gated `full_internal_state` with the `->`. Under a "fallback to `=>`" rule, when `@req.flagged` is false no `->` fires and the LLM sees `full_internal_state`. The gate the developer thought they put in place leaks in exactly the case they were trying to gate.

Strict mode forces the developer to handle every code path. Use `=->` to cover the "both consumers see this" case cleanly:

```mlld
exe @gate(req) = [
  if @req.flagged [
    -> { status: "blocked", reason: @req.flag_reason }
    => { ok: false, full_state: @req.full_internal_state }
  ]
  else [
    =-> { ok: true, processed_state: @req.processed }
  ]
]
```

Now the LLM sees `{ status: "blocked", ... }` when flagged and `{ ok: true, processed_state: ... }` when not flagged. It never sees `full_internal_state`. Strict mode + `=->` makes the gate complete with one sigil per branch.

## Multi-reach polymorphism

The tool slot's final value is determined by counting how many `->` (or `=->`) statements were reached at runtime:

| Reaches at runtime | Source context | Slot value |
|---|---|---|
| 1 | any | the single value (any shape) |
| N > 1 | any | array of N values, in order of reach |
| 0 | all `->`/`=->` lexically inside `for` bodies | `[]` |
| 0 | any `->`/`=->` at a non-loop position | `null` |

**One `-> [1, 2, 3]` is one reach** — the tool slot holds the array as a single value. **Three separate `-> "a"`, `-> "b"`, `-> "c"` statements reached in sequence** are three reaches — the slot holds `["a", "b", "c"]`. Both produce the same JSON output, but the count rule is "wrap if more than one write," not "wrap if the value is an array."

The empty-for-body case returns `[]` for shape consistency with non-empty for-body results (a consumer can write "always an array" parsing logic). The empty-non-loop case returns `null` to signal "no branch covered this path" — usually a bug in the developer's coverage that strict mode surfaces rather than silently leaking via `=>` fallback.

## Per-iteration `->` in a for loop

```mlld
exe @sendBatch(emails) = [
  for @email in @emails [
    let @r = run cmd { email-cli send --to @email.to --subject @email.subject --body @email.body }
    -> { recipient: @email.to, status: "sent" }
  ]
  => { count: @emails.length }
]
```

Each iteration reaches the `->` once. For N emails, the tool slot holds `[{recipient,status}, {recipient,status}, ...]` — an array of N values. mlld code still gets `{ count: N }` via `=>`. Empty input returns `[]` (not `null`) because all `->` statements are lexically inside the for body.

**Do not use `=->` inside a for-loop body.** `=->` triggers early return, so it terminates the loop on the first iteration. Use `->` (passive write) inside loops; reserve `=->` for terminal return positions.

## Composition: inner `->` is invisible

```mlld
exe @innerEmail(to, subj, body) = [
  -> { status: "sent" }
  => { full: "..." }
]

exe @sendBatch(emails) = [
  let @results = for @email in @emails => @innerEmail(@email.to, @email.subject, @email.body)
  >> @results is an array of => values (the full ones).
  >> The -> values from @innerEmail are NOT visible here. @sendBatch is mlld code
  >> calling mlld code; -> only fires at LLM tool dispatch boundaries.
  -> { sent: @emails.length }
  => { count: @emails.length, results: @results }
]

@claude("Send all", { tools: [@sendBatch] })
>> LLM calls @sendBatch as a tool.
>> @sendBatch internally calls @innerEmail multiple times using the => path
>> because that's mlld-to-mlld, not LLM-to-tool.
>> @sendBatch returns its own -> value to the LLM: { sent: 3 }
```

**`->` has no semantics outside of LLM tool dispatch.** Inner exe `->` values do not propagate, accumulate, or bubble. Each exe's `->` is consulted only when an LLM directly invokes that exact exe as a tool. There is no composition rule, no session protocol, no accumulator.

## Only-`->` exes (LLM-only tools)

```mlld
exe @logForLLM(msg) = [
  -> { logged: @msg, ts: @now }
]
```

An exe with only `->` and no `=>` is in strict mode. Called from mlld code, its canonical slot is empty (effectively "returns nothing useful"). Called as a tool by an LLM, it returns the `->` value. This is the pattern for tools that only make sense when invoked by an LLM.

## Interaction with display projection and record coercion

`->` bypasses producer-side reshaping:

- **No implicit producer-side display projection** on `->` values. If you want the standard record-mediated planner view, prefer the canonical path — `=> @value as record @Type`, `=> record @schema`, or `=> @cast(@value, @schema)` — and let the bridge apply the active `role:*` display projection.
- **No record coercion** on `->` values. `=>` still flows through the exe's output record adapter; `->` does not.
- **Producer-side taint follows the `->` / `=->` expression itself.** Values referenced in the tool-return expression contribute their labels and taint. Earlier tainted work elsewhere in the exe body does not taint the tool slot unless that data is used in the returned expression.
- **Explicit casts are still allowed before `->`.** If you want validation and record metadata on an intermediate value, do it yourself with `@cast(@raw, @contact)` or `@raw as record @contact` before writing `->`. `->` still will not add another coercion or projection step on top.
- **No withClause finalization** on `->` values.

Consumer-side defenses still fire:

- **Tool result payloads are still tagged `untrusted`** on the LLM's side via existing bridge stamping. A `->` value consumed by a subsequent tool call in the same LLM session cannot be used in `known` bucket authorization (it fails `known_from_influenced_source` per the existing label flow).
- **Source labels and provenance stamping** are applied at the bridge crossing, identical to how `=>` tool results are stamped.
- **Surfaced-tool policy enforcement** fires for tool-slot dispatches the same as for canonical-slot dispatches.

**Strict mode and `->` give the developer control over the data SHAPE the LLM sees.** They do not bypass the runtime's security model on the consumer side. A developer who returns sensitive data via `->` does not thereby unlabel it.

Audit story: `->` and `=->` are grep-able by design. `grep -rn "^\s*-> \|^\s*=-> " src/` finds every place data flows to LLMs via these channels.

## When to use each

- **`=>` only** (classic mode) — the default. Most exes. Use this when the LLM should see the normal projected record/domain result and there is no reason for a differentiated planner-facing tool result.
- **`=> + ->`** — when the planner-facing tool result should intentionally differ from the canonical return. Common cases: the exe processes tainted content or full state that mlld code needs to log/persist, but the LLM should only see clean attestation; or the planner should see a wrapper like `{ found, contacts, summary }` instead of the plain domain record alone.
- **`=->` alone** — when both consumers should see the same value and you want strict mode's explicit coverage. Common in branches where you'd otherwise write `-> @v => @v` as two statements.
- **`->` only** — when the exe is an LLM-facing tool with no mlld-code consumer. The canonical slot is deliberately empty.

See `pattern-planner` for the canonical persistent-session agent pattern that uses `->` to expose workers as tools to a planning LLM.
