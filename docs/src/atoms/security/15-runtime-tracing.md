---
id: runtime-tracing
title: Runtime Effect Tracing
brief: Real-time structured traces for shelf writes, guard decisions, handle issue/resolve/release, policy builds, and authorization checks
category: security
parent: audit-log
tags: [tracing, debugging, observability, guards, shelf, handles, policy]
related: [audit-log, tool-call-tracking, security-guards-basics, labels-overview, facts-and-handles, shelf-slots, policy-auth]
related-code: [core/types/trace.ts, interpreter/tracing/RuntimeTraceManager.ts, interpreter/tracing/events.ts, interpreter/env/Environment.ts]
updated: 2026-04-07
qa_tier: 2
---

When something goes wrong in a defended agent workflow, the symptom appears far from the cause. A shelf write that silently fails shows up as empty state three turns later. A guard resume that doesn't fire manifests as a collapsed planner loop. A handle that loses proof during interop surfaces as an authorization denial on a different phase.

Runtime tracing makes these cause-and-effect chains visible. Every security-relevant runtime effect emits a structured event when tracing is enabled.

## Enabling tracing

**CLI:**

```bash
mlld run pipeline --trace effects
mlld run pipeline --trace handle
mlld run pipeline --trace handles
mlld run pipeline --trace verbose
mlld run pipeline --trace verbose --trace-file tmp/trace.jsonl
```

**SDK:**

```python
result = client.execute("pipeline.mld", trace="effects")
for event in result.trace_events:
    print(event["event"], event["data"])
```

**Per-invocation in mlld:**

```mlld
var @result = @claude(@task, { tools: @writeTools }) with { trace: "effects" }
```

## Trace levels

| Level | What's traced |
|---|---|
| `off` | Nothing (default) |
| `effects` | Shelf writes/clears, guard decisions, policy builds, auth checks, record schema failures, stale-read detection |
| `handle` / `handles` | Only handle lifecycle events (`handle.issued`, `handle.resolved`, `handle.resolve_failed`, `handle.released`) |
| `verbose` | Everything in `effects` plus shelf reads, handle lifecycle events, display projections, LLM calls, tool calls, record coercions |

Start with `effects` for debugging. Use `handle` when you're isolating proof-bearing handle flow. Use `verbose` when you need the full runtime picture.

## Event categories

Every trace event has this shape:

```json
{
  "ts": "2026-04-05T10:23:45.123Z",
  "level": "effects",
  "category": "shelf",
  "event": "shelf.write",
  "scope": {
    "exe": "@resolveTargetWorker",
    "box": "@researcher",
    "guard_try": 1
  },
  "data": {
    "slot": "@outreach.recipients",
    "action": "write",
    "success": true,
    "value": { "kind": "array", "length": 3, "bytes": 92, "human": "92 B" }
  }
}
```

`scope` identifies where in execution the event occurred. `scope.file` is included when the runtime knows which module/file currently owns execution, which is especially useful for imported executable calls. `data` is category-specific. Values are summarized (strings truncated, objects reduced to `{kind, size, keys}`) and now include an approximate serialized size (`bytes`, `human`) to help spot unexpectedly large payloads without enabling a separate profiler.

### Import

| Event | Level | Data |
|---|---|---|
| `import.resolve` | verbose | ref, resolvedPath, transport, importType, directive |
| `import.cache_hit` | verbose | ref, resolvedPath, cacheKey, exportCount |
| `import.read` | verbose | ref, resolvedPath, transport, contentType |
| `import.parse` | verbose | ref, resolvedPath, contentType |
| `import.evaluate` | verbose | ref, resolvedPath, transport |
| `import.exports` | verbose | ref, resolvedPath, exportCount |
| `import.fail` | effects | phase, ref, resolvedPath, error |

Import traces make the import pipeline debuggable from inside mlld: resolution, content fetch/read, parse, module evaluation, export materialization, and failure points all show up in both `traceEvents` and `--trace-file`.

### Shelf

| Event | Level | Data |
|---|---|---|
| `shelf.write` | effects | slot, action, success, value summary |
| `shelf.clear` | effects | slot, success |
| `shelf.remove` | effects | slot, success |
| `shelf.read` | verbose | slot, found, value summary |
| `shelf.stale_read` | effects | slot, writeTs, readTs, expected, actual, message |

`shelf.stale_read` fires when a read returns different data than a write in the same execution context. This catches the "write succeeded but state was empty" class of bugs immediately.

### Guard

| Event | Level | Data |
|---|---|---|
| `guard.evaluate` | effects | phase, guard, operation, decision counts, trace count |
| `guard.allow` | effects | phase, guard, operation, reasons, hints |
| `guard.deny` | effects | phase, guard, operation, reasons, hints |
| `guard.retry` | effects | phase, guard, operation, reasons, hints |
| `guard.resume` | effects | phase, guard, operation, reasons, hints |
| `guard.crash` | effects | phase, guard, operation, error details |

Guard traces show both individual evaluations and aggregate decisions. When multiple guards disagree, the trace shows the precedence resolution (`deny > resume > retry > allow`).

### Handle

| Event | Level | Data |
|---|---|---|
| `handle.issued` | verbose | handle ID, value preview, factsource ref, sessionId |
| `handle.resolved` | verbose | handle ID, value preview, sessionId |
| `handle.resolve_failed` | verbose | handle ID, reason, sessionId |
| `handle.released` | verbose | sessionId, handleCount |

Trace handle lifecycle to debug authorization failures. If `auth.deny` fires because a fact arg lacks proof, check whether the corresponding `handle.issued` happened and whether `handle.resolved` succeeded.

### Policy and authorization

| Event | Level | Data |
|---|---|---|
| `policy.build` | effects | mode, tool count, valid, issue/repair/drop counts |
| `policy.validate` | effects | same as policy.build |
| `policy.compile_drop` | effects | dropped entries and array elements |
| `policy.compile_repair` | verbose | repaired args with repair steps |
| `auth.check` | effects | tool, args summary, effective auth args |
| `auth.allow` | effects | tool, matched attestation count |
| `auth.deny` | effects | tool, reason, code |

The policy/auth chain is the most common debugging target. A typical investigation:

1. `auth.deny` shows which tool and why
2. `policy.build` shows whether the authorization compiled correctly
3. `policy.compile_drop` shows if bucketed intent entries were dropped (missing proof)
4. `handle.resolve_failed` shows if a handle reference was broken

### Display

| Event | Level | Data |
|---|---|---|
| `display.project` | verbose | record, field, mode (bare/ref/masked/handle/omitted) |

Trace display projections to verify that LLMs see the right fields in the right modes. If an agent copies a preview instead of using a handle, check whether `ref` mode was active.

### LLM

| Event | Level | Data |
|---|---|---|
| `llm.call` | verbose | provider, model, tool count, resume flag, ok, duration |
| `llm.resume` | verbose | same as llm.call (resume=true) |
| `llm.tool_call` | verbose | tool name, args |
| `llm.tool_result` | verbose | tool name, ok, result summary, duration |

### Record

| Event | Level | Data |
|---|---|---|
| `record.coerce` | verbose | record, field, shelf slot, expected type, value |
| `record.schema_fail` | effects | record, shelf slot, reason |

`record.schema_fail` at effects level catches record validation errors early — before they propagate as mysterious empty state.

## Output channels

| Channel | Format | Use case |
|---|---|---|
| `result.traceEvents` | Structured array on SDK result | Programmatic analysis |
| stderr | Human-readable `[trace:category] event key=value` lines | Interactive debugging |
| `--trace-file path.jsonl` | One JSON object per line | Post-hoc analysis, sharing traces |

Stderr output is enabled automatically when `--trace` is set to `effects` or `verbose`.

## Debugging workflows

### "Why was my tool call denied?"

```bash
mlld run pipeline --trace effects 2>tmp/trace.log
```

Filter for the auth chain:

```bash
grep -E 'auth\.|policy\.' tmp/trace.log
```

Look for `auth.deny` → check `policy.build` for compilation issues → check `policy.compile_drop` for missing proof.

### "Why is shelf state empty after a write?"

```bash
mlld run pipeline --trace effects --trace-file tmp/trace.jsonl
```

```bash
jq 'select(.category == "shelf")' tmp/trace.jsonl
```

If `shelf.write` shows `success: true` but a later `shelf.read` returns stale data, the `shelf.stale_read` event will fire with timestamps and expected vs actual values.

### "Which handle resolved to which value?"

```bash
mlld run pipeline --trace handle --trace-file tmp/trace.jsonl
```

```bash
jq 'select(.category == "handle")' tmp/trace.jsonl
```

Follow the lifecycle: `handle.issued` (where proof was created) → `handle.resolved` (where it was consumed) → or `handle.resolve_failed` (where it was lost). `handle.released` marks per-call bridge teardown and reports how many handles were in scope for that session.

## Related runtime metadata

Tracing is one side of the debugging surface. Ambient `@mx.*` accessors expose the current runtime state directly inside mlld expressions:

- `@mx.handles`
- `@mx.llm.sessionId`
- `@mx.llm.display`
- `@mx.llm.resume`
- `@mx.shelf.writable`
- `@mx.shelf.readable`
- `@mx.policy.active`

See `docs/src/atoms/core/32-builtins--ambient-mx.md` for the accessor shapes and examples.

## Tracing vs audit logging

| | Tracing | Audit logging |
|---|---|---|
| **Purpose** | Debug how effects propagate | Record what happened for compliance |
| **When** | On-demand, during development | Always on |
| **Scope** | All security-relevant effects | Tool calls, label changes, file writes |
| **Output** | Structured events, stderr, JSONL | `.llm/sec/audit.jsonl` |
| **Overhead** | Only when enabled | Minimal, always active |

Use tracing to understand *why* something happened. Use audit logging to prove *that* it happened.
