# Spec: First-Class Runtime Effect Tracing

## Status

Implemented. This doc now serves as the design record and payload reference for the runtime tracing system.

## Problem

When something goes wrong in a complex agent workflow, the symptom appears far from the cause. A shelf write that silently fails manifests as an empty state summary three turns later. A guard resume that doesn't fire shows up as a collapsed planner loop. A handle that loses proof during JS interop surfaces as a proofless authorization denial on a different phase.

Debugging these requires custom probes, ad hoc logging, and forensic reconstruction. The runtime owns the effects — it should trace them.

## Design

Every security-relevant and state-relevant runtime effect emits a structured trace event when tracing is enabled. Events are machine-readable, scoped to the execution context, and available through both runtime APIs and SDK output.

### What gets traced

| Category | Events |
|---|---|
| **Shelf** | `shelf.write`, `shelf.read`, `shelf.clear`, `shelf.remove` — slot ref, caller, value summary, box context, success/failure |
| **Guard** | `guard.evaluate`, `guard.allow`, `guard.deny`, `guard.retry`, `guard.resume` — guard name, op, condition result, try number, output summary |
| **Handle** | `handle.mint`, `handle.resolve`, `handle.resolve_fail` — handle ID, source (display projection / builder / fyi.known), value summary |
| **Policy** | `policy.build`, `policy.validate`, `policy.compile_drop`, `policy.compile_repair` — tool, arg, reason, proof status |
| **Authorization** | `auth.check`, `auth.allow`, `auth.deny` — tool, arg values, positive check result, taint check result |
| **Display** | `display.project` — record, field, mode (bare/ref/masked/handle/omitted), handle issued |
| **LLM** | `llm.call`, `llm.resume`, `llm.tool_call`, `llm.tool_result` — session ID, model, tool name, duration |
| **Record** | `record.coerce`, `record.schema_fail` — record name, valid/invalid, errors |

### Event shape

Every trace event has a common envelope:

```json
{
  "ts": "2026-04-05T10:23:45.123Z",
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
    "element_count": 3,
    "success": true
  }
}
```

`scope` identifies where in the execution the event occurred. `data` is category-specific.

### Trace levels

| Level | What's traced |
|---|---|
| `off` | Nothing (default) |
| `effects` | Shelf writes, guard decisions, policy builds, auth checks |
| `verbose` | Everything including handle mints, display projections, record coercions, LLM calls |

### How to enable

**Per-execution:**

```mlld
mlld run script.mld --trace effects
mlld run script.mld --trace verbose
```

**In code:**

```mlld
var @result = @claude(@task, { tools: @writeTools }) with { trace: "effects" }
```

**SDK:**

```python
result = client.execute(script, trace="effects")
for event in result.traceEvents:
    print(event)
```

### Output channels

1. **SDK `result.traceEvents`** — structured array on the execution result. The primary programmatic interface.
2. **Stderr stream** — human-readable trace lines during execution. For interactive debugging.
3. **File sink** — `--trace-file path.jsonl` writes trace events to a JSONL file. For post-hoc analysis.

### Implementation notes

- Every emitted event currently includes `ts`, `level`, `category`, `event`, `scope`, and `data`.
- Invocation-level overrides are implemented via `with { trace: "off" | "effects" | "verbose" }` on exec calls.
- `llm.tool_call` is a start-phase event and includes `phase: "start"`. `llm.tool_result`, `llm.call`, and `llm.resume` are finish-phase events and include `phase: "finish"` plus `durationMs` when available.
- Guard tracing emits both aggregate decision events from the pre/post hook orchestrators and per-guard decision/crash events from the runtime evaluators.
- Authorization and policy payloads are intentionally summarized outcomes, not full proof graphs.

### Same-turn visibility assertions

In `effects` and `verbose` mode, if code does `@shelf.write(@slot, value)` and then `@shelf.read(@slot)` in the same execution context and the read returns stale data, the runtime emits a diagnostic:

```json
{
  "category": "shelf",
  "event": "shelf.stale_read",
  "data": {
    "slot": "@outreach.recipients",
    "write_ts": "...",
    "read_ts": "...",
    "message": "shelf.read returned stale data after shelf.write in the same context"
  }
}
```

This would have caught the benchmark's "write succeeded but state was empty" bug immediately.

### Guard decision trace

Every guard evaluation emits the full decision chain:

```json
{
  "category": "guard",
  "event": "guard.resume",
  "scope": { "exe": "@callResolveTarget", "guard_try": 1 },
  "data": {
    "guard": "@retryResolveShape",
    "condition": "@output.mx.schema.valid == false",
    "decision": "resume",
    "message": "Return valid JSON..."
  }
}
```

When a guard fires `resume`, the trace shows it. When a guard's condition crashes (the `&&` evaluation bug), the trace shows the crash. When multiple guards disagree, the trace shows the precedence resolution.

## What this replaces

- Ad hoc `@logCapabilityWorkerCall` helpers in the benchmark
- Custom Python probes like `tmp/probe_state_writes.py`
- Manual `show @debug` statements scattered through orchestration code
- Forensic reconstruction from JSONL output files

## Relationship to hooks

mlld already has hooks (`hook after op:named:fn = [...]`). Tracing is complementary:

- **Hooks** are user-authored observers for specific events. They run mlld code.
- **Traces** are runtime-generated structured events across all categories. They're machine-readable.

Hooks are for custom behavior (logging to a service, triggering alerts). Traces are for understanding what happened.

Long-term, the trace system could be the backend that hooks observe. But for v1, traces are a separate output channel.

## Implementation scope

1. **Trace event type and envelope** — `core/types/trace.ts`
2. **Trace context on Environment** — trace level, event buffer, scope stack
3. **Emit calls at each effect site** — shelf runtime, guard evaluators, handle registry, policy compiler, auth checks, display projection, LLM bridge, record coercion
4. **Trace level filtering** — only emit events at or above the configured level
5. **Output channels** — SDK result field, stderr formatter, file sink
6. **CLI flag** — `--trace off|effects|verbose` and `--trace-file path.jsonl`
7. **SDK support** — `trace` option on `execute()`, `result.trace_events` on the response

## Non-goals

- Replacing the audit log (`.mlld/sec/audit.jsonl` — that's for security audit, not debugging)
- Tracing inside JS/Python exe blocks (the runtime can't see inside those)
- Performance profiling (traces are for correctness debugging, not timing optimization)
- Always-on tracing (off by default, must be explicitly enabled)
