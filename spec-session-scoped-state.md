# Spec: Per-LLM-Call Session State (`var session`)

**Status:** Draft
**Primitive:** `var session @name = { ... }`
**Access:** `@name` (the var name bound in the declaration; context-dependent resolution — schema outside a live frame, live instance inside one)
**Lifetime:** Bound to the enclosing LLM-bridge call

---

## 1. Summary

A new labeled-var form that declares a **typed, per-LLM-call mutable state container**. The declaration holds a schema; the runtime materializes a fresh instance for each `@claude()` / `@opencode()` / etc. invocation that references the schema. Every tool callback dispatched by that invocation can read and write the session by referencing the declared name (e.g. `@planner.set(...)`). The instance dies when the call exits. The underlying var binding is immutable (it holds the schema); mutability is exposed through an explicit runtime API on the live-instance accessor, so var-immutability and taint propagation are preserved.

The primitive exists to provide one well-scoped mutable accumulator that is visible across all tool callbacks of a single LLM conversation — the container GPT's rig review asked for as "session-local tool-use state." With `var session` in place, the per-LLM-call accumulator is a language primitive and rig's `session.mld` collapses to one schema declaration.

The stronger motivation isn't LOC: the removed bookkeeping is the source of known bug classes (state aliasing in ticket m-5683, null-callback families in UT14). Deleting the boilerplate deletes the class of bugs that boilerplate enables. Guard-based middleware built on top of sessions (budgets, counters, terminal latches, execution logs, denial logging) collapses to short idioms for the ~80% of per-wrapper boilerplate that is pure accumulation; result-shape coercion, async kickoff patterns, and cross-tool-call state machines that aren't pure accumulators still live in wrapper exes.

---

## 2. Motivation

Today, rig builds this accumulator in user space via a global `shelf` (`clean/rig/session.mld`):

- 4 record declarations to wrap single-value slots
- 1 `shelf @plannerSession` declaration
- `@slotValue` unwrap helper
- `@emptyPlannerRuntime` constant
- `@resetPlannerSession`, `@initializePlannerSession`
- 4 getters (`@plannerAgent`, `@plannerQuery`, `@plannerState`, `@plannerRuntime`)
- 2 setters (`@writePlannerState`, `@writePlannerRuntime`)
- A global shelf singleton + manual reset on every planner call

The global shelf has three problems:

1. **Aliasing across concurrent calls.** Two parallel `@claude()` planner calls both touch the same shelf.
2. **Manual lifecycle.** Every planner entry must call `@initializePlannerSession` / `@resetPlannerSession`; forgetting leaks state.
3. **Boilerplate per slot.** Typed slot access requires wrapping records, an unwrap helper, and matched getter/setter pairs.

None of these are rig-specific — any framework that wants to accumulate state across tool callbacks in one LLM conversation hits them. The right fix is a language primitive whose lifetime matches the problem.

---

## 3. Core Design

### Declaration

```mlld
var session @planner = {
  agent: object,
  query: string,
  state: object,
  runtime: @plannerRuntime
}
```

The RHS is a JSON-shaped object whose field values are types (primitive type names like `object`, `string`, `number`, `boolean`, `array`, or references to declared records). Types may be marked optional with `?`: `runtime: @plannerRuntime?`.

The var binding is immutable and holds the **schema**, not live state. The schema is exportable and importable like any var.

### Access

The declared name is context-dependent. Outside any live session frame, `@planner` is the schema you declared — a type spec, referenced by other declarations (slot types, input-record cross-references, etc.). Inside a tool callback dispatched by an LLM invocation whose frame attached this schema, the same name resolves to the live instance with read fields and write methods.

Formally, resolution rules:

| Position | Resolves to |
|---|---|
| **Value-expression** (reads like `@planner.runtime`, method calls like `@planner.set(...)`) | Live instance if the **nearest enclosing bridge frame** attached this schema. If the nearest enclosing bridge frame did **not** attach this schema, raises `MlldSessionNotAttachedError` — lookup does **not** walk past the nearest frame to find an outer one. |
| **Bare name inside a live frame** (e.g., `var @sess = @planner`) | Immutable snapshot of the session's current state at access time — a plain object with each slot's current labeled value. The snapshot does not track further mutations; mutation still requires method calls on `@planner` directly. |
| **Schema-valued** (`with { session: @planner }`, type position in another record/session slot, passed to a runtime primitive expecting a schema) | The schema declaration itself — never the live instance, even inside an attached frame |
| **Export / import** | The schema declaration; live instances do not export |

Schema-valued positions are fixed and listed — new positions added later would need to be declared schema-valued in their own spec.

**Strict nesting.** The value-expression rule inspects only the nearest enclosing bridge frame, not the whole stack. If the nearest frame didn't attach this schema, that's an error — outer frames remain unreachable even if they did attach it. This is load-bearing for isolation: an inner `@claude()` worker must not be able to read or mutate an outer planner's session by knowing its declaration name.

Runtime lookup uses **declaration identity**, not raw name string. Each `var session @name = {...}` declaration is assigned a stable `SessionDeclarationId` at definition time (form: `${sourceFilePath}#${exportedName}` or an internal symbol). The bridge dispatches based on this identity, so two modules each declaring `var session @planner = {...}` never collide — even if both are imported into the same script under the same local name, the bridge sees distinct declarations.

Identity-keyed internally; name-carried externally. Trace events, `result.sessions`, and session-final emission carry the declaration's canonical exported name (not any caller-side alias) for external visibility.

Example inside a live frame:

```mlld
var @count = @planner.runtime.tool_calls
@planner.set(runtime: { ...@planner.runtime, tool_calls: @count + 1 })
@planner.write("runtime.terminal", "send_email")
@planner.increment("runtime.tool_calls", 1)
@planner.append("log", { tool: @mx.op.name, at: @now() })

>> Functional update — the fn argument is an exe reference, not a literal lambda.
>> Declare the transform as a named exe and pass its reference:
exe @bumpCalls(runtime) = { ...@runtime, tool_calls: @runtime.tool_calls + 1 }
@planner.update("runtime", @bumpCalls)

@planner.clear("runtime")
```

Dotted field access is read-only; writes go through explicit methods (`.set` / `.write` / `.update` / `.append` / `.increment` / `.clear`). This mirrors the pattern used elsewhere: a var name resolves to a value you read directly; mutation goes through a named API surface, never through bare property assignment.

Because access is keyed by the declared name, `@mx.*` remains entirely read-only — session writability is a property of the named accessor, not of the ambient namespace.

### Attaching a schema to a call

The schema is attached to an LLM-calling exe (or an individual call site) via `with { session: @name }`:

```mlld
exe llm @planner(prompt, cfg) = @claude(@prompt, @cfg) with {
  session: @planner
}
```

Or inline at a call:

```mlld
@claude(@prompt, @cfg) with { session: @planner }
```

When a wrapper exe carries a session binding, **every call to the wrapper auto-provisions its own session instance** — no per-call-site ceremony is required on the caller.

When the enclosing frame did not attach a given schema, referencing that name as a live instance (e.g. `@planner.set(...)` where the current frame did not attach `@planner`) raises a runtime error naming the missing schema. There is no untyped-bag fallback; only attached schemas light up live-instance access.

---

## 4. Grammar

`session` attaches to the `var` directive as a **separate bare-keyword segment**, parallel to how `tools` already works. It is NOT a member of `DataLabelList` (the alphabet that holds `secret`/`untrusted`/`pii`/etc.). This matches the codebase's current pattern where role-shape keywords like `tools` sit in a dedicated segment before the comma-separated sensitivity labels.

Grammar shape (extending `grammar/directives/var.peggy:9`):

```peggy
SlashVar
  = DirectiveContext VarKeyword
    toolsSegment:(HWS "tools")?
    sessionSegment:(HWS "session")?
    labelsSegment:(HWS DataLabelList HWS &"@")?
    _ "@" id:BaseIdentifier optionalMarker:("?" { return true; })? _ "=" _ value:VarRHSContent ending:SecuredDirectiveEnding
```

`session` must also be added to the reserved-keyword list in `grammar/patterns/security.peggy:39` so it cannot appear as a generic data label.

`session` is **mutually exclusive with `tools`** at grammar level (both segments are optional; both present is a parse error — `tools session` or `session tools` ordering is invalid). `session` is **mutually exclusive with `secret`/`untrusted`/`pii`** at **runtime level** (flag check after parsing raises a clear error), since the grammar doesn't prohibit combining a `session` segment with a separate `DataLabelList`.

The RHS when `session` is present is parsed as a `DataObjectLiteral` (no grammar change). Post-parse validation in `interpreter/eval/var/session-schema.ts` checks each value is a `TypeExpr`:
- Primitive: `string`, `number`, `boolean`, `object`, `array`
- Record reference: `@recordName`
- Typed array: `@recordName[]`, `string[]`, etc.
- Optional suffix on any of the above: `?`

---

## 5. Lifetime

### Scope

A session instance is bound to **the runtime frame of its enclosing LLM-bridge call** — the same frame that owns the per-call handle mint table and per-call proof-claims-registry view.

- **Born** when `@claude()` / `@opencode()` / equivalent enters, if the call's config or the calling exe's `with` carries a `session:` reference.
- **Dies** when the call exits (normally, via denial, or via cancel).

### Nesting

Nested LLM calls each have their own session frame. Inside a nested call, a declared session name resolves **only against the innermost enclosing bridge frame**. If the innermost frame attached that schema, the declared name resolves to its live instance. If the innermost frame did not attach that schema, access raises `MlldSessionNotAttachedError` — lookup does not walk outward.

This strict one-frame rule is load-bearing for isolation. An inner worker attempting to read an outer planner's session (e.g., to exfiltrate or mutate planner state) will not find it, regardless of whether the outer declared it under the same name. The only way for an inner frame to observe outer state is via explicit parameter passing through the prompt or a shelf.

```mlld
exe llm @outer(p) = @claude(@p, {}) with { session: @sessA }
exe llm @inner(p) = @claude(@p, {}) with { session: @sessB }

>> Inside a tool callback dispatched by @inner:
>> @sessB resolves to the inner frame's instance.
>> @sessA is unreachable — outer's session is isolated from inner.
```

This mirrors how `@mx.op`, `@mx.args`, `@mx.guard.try` already nest — always the nearest frame of their kind. No new nesting rule is introduced.

### Concurrency

Two concurrent `@planner(...)` calls (e.g., fan-out in a pipeline) get independent session instances. No coordination, no aliasing.

### Resume

`resume` runs a new runtime frame with `tools = []` and auto-provisioned shelve disabled (see `labels-policies-guards.md` §"Resume invariants"). Because a resumed call is a new frame, it gets a **fresh session instance**. Rig counters do not survive across a resume — which is correct, because resume cannot fire new tool callbacks that would update them.

### Callback throw

An unhandled throw inside a tool callback tears down the call the same way cancellation does: writes committed before the throw remain visible to any in-flight guards that fire during teardown (so denial logging can see the pre-throw state), then the session instance is discarded with the frame. No partial state leaks to the caller.

If future work calls for cross-call session continuity, add it orthogonally as a mirror:

```mlld
@claude(@p, @cfg) with { session: @planner, mirror: "state://planner" }
```

Not in scope for v1.

---

## 6. Runtime Instance and Access API

### Instance shape

At runtime, the session instance is a runtime-owned object indexed by slot name. Each slot holds either an unset sentinel (field-level "not yet written") or a labeled value envelope (see §7).

### Accessor surface on the declared name

Read — dotted accessor on the declared name, produces a fresh labeled value binding per access:

```mlld
var @agent = @planner.agent
var @calls = @planner.runtime.tool_calls
```

Optional slots (`slot?`) return `undefined` on unset read. Required slots raise a read-before-write error if accessed before a seed or explicit write populates them — see §7.

Write — explicit methods:

```mlld
>> Whole-slot replacement
@planner.set(runtime: @newRuntime)

>> Multiple slots at once
@planner.set(runtime: @newRuntime, state: @newState)

>> Dotted-path write for nested structures
@planner.write("runtime.tool_calls", @n + 1)

>> Path arrays accepted for programmatically constructed paths
@planner.write(["runtime", "tool_calls"], @n + 1)

>> Atomic functional update — safer than read-modify-write, forward-compatible with parallel dispatch.
>> The second argument is a reference to a declared exe that takes the current slot value and
>> returns the new value. Uses existing exe syntax — no anonymous-lambda literal introduced.
>>
>> The update exe must be a **pure/local** executable: js, node, mlld-exe-block, or mlld-when.
>> llm-typed exes and any exe that can fire tool dispatches are rejected at call time with a
>> clear error. This keeps commit semantics simple: an update cannot re-enter the bridge and
>> trigger further session writes while the first is still mid-commit.
exe @bumpCalls(runtime) = { ...@runtime, tool_calls: @runtime.tool_calls + 1 }
@planner.update("runtime", @bumpCalls)

>> Atomic increment on numeric slots
@planner.increment("runtime.tool_calls", 1)

>> Atomic append to array slots
@planner.append("log", { tool: @mx.op.name, at: @now() })

>> Clear a named slot (dies-with-call covers whole-session teardown)
@planner.clear("runtime")
```

`.clear()` is always allowed regardless of whether the slot is required or optional — it's a valid mid-call operation (e.g., phase boundaries that want to reset a nested slot). Clearing a **required** slot is intentional: subsequent reads raise `MlldSessionRequiredSlotError` (the slot is unset, and unset-read is an error for required slots) until a write populates it again. Framework authors can use this as a "force next phase to reseed" signal. Clearing an **optional** slot returns subsequent reads to `undefined` without error.

Every write validates against the slot type. Type mismatch raises a runtime error before the write commits. Slot writes **replace** the whole slot value — the label set of the new slot is whatever the written value carries; prior labels do not merge. For partial updates, use `.update(path, fn)`.

Session writes are serialized per-call-frame: the current bridge dispatch model runs tool callbacks sequentially within a single LLM conversation, so interleaving cannot occur. Atomic helpers (`.update`, `.increment`, `.append`) exist both for ergonomics today and forward-compatibility with future parallel tool dispatch.

### Session is not a var

Key invariant: **no user var is mutated by session writes**. Every read produces a new immutable value binding carrying the labels attached at write time. The session store is runtime-owned state accessed through an explicit API, conceptually parallel to `localStorage` vs local variables in JS. Var-immutability and taint-tracking integrity are unaffected.

**Bare name access is a snapshot.** Inside a live frame, `@planner` (used as a value, not followed by a method call or field access) evaluates to an **immutable snapshot** of the session's current state — a plain object with each slot's current labeled value. `var @sess = @planner` captures that snapshot; subsequent reads of `@sess.runtime` see the snapshot, not further mutations. To observe live state, go through `@planner.runtime` directly each time. To mutate, call methods on `@planner` itself.

This closes the var-immutability gap cleanly: vars never hold live mutable references; the only mutable surface is the method API on the declared name.

---

## 7. Type Validation

Session slots are type-validated on write. Supported type expressions:

- Primitives: `string`, `number`, `boolean`, `object`, `array`
- Record references: `@recordName` — enforces the record's shape via the same validator used by `=> record @name` coercion, without minting fact labels (sessions are accumulators, not proof sources)
- Typed arrays: `@recordName[]` — array where every element must validate against the record shape. Also accepted: `string[]`, `number[]`, `object[]`. Required for headline use cases like execution logs (`log: @logEntry[]`); ships in v1.
- Optional suffix: `@recordName?`, `string?`, `@recordName[]?` — slot may be absent; reading an unset optional slot returns `undefined`

### Required vs optional slots

Slots without `?` are **required**. Either a `seed:` write populates them at call start, or the first access raises `MlldSessionRequiredSlotError`. Required slots guarantee downstream code never sees them as `undefined`.

Slots with `?` are **optional**. Reading an unset optional slot returns `undefined` without error. Writes are always validated regardless of required/optional — a write of a value that fails type validation is rejected whether the slot is required or not.

### Write validation

Writing a value whose shape does not match the declared slot type raises `MlldSessionTypeError` before the store updates. Error message names the slot, expected type, and actual value shape. Atomic helpers (`.update`, `.increment`, `.append`) validate their post-computation result against the slot type — `.increment` on a non-numeric slot raises; `.append` on a non-array slot raises.

### Records used as session slot types are input-style

Session slots do not mint fact labels on write — a session is a runtime accumulator, not an authoritative source. Records referenced as session slot types should not declare `display:` or `when:` sections (the runtime will reject session-targeted records that do, the same way input records reject them). This matches how input records are used in `inputs:` bindings.

---

## 8. Label and Taint Semantics

The session stores **labeled envelopes**, not bare values. This means:

- A write preserves the label set of the written value (`untrusted`, `pii`, `influenced`, `fact:*`, etc.)
- A read produces a value carrying those labels unchanged
- Labels propagate through session I/O exactly as they do through any other mlld value flow

A tool callback that writes `untrusted` data to `@planner` makes that data visible to later callbacks as `untrusted`. A guard reading `@planner.foo.mx.labels` sees what was written.

**Sessions do not strip taint.** Writing an `untrusted` value and reading it later produces an `untrusted` value. If a framework wants to allow-list specific session-derived values, use a privileged guard on the data being re-emitted, not on the session itself.

**Sessions do not mint proof.** A session-derived value never carries `fact:*` unless the original write already carried it. Values written and read back retain the exact label set of the write input.

**The session accessor as a whole is unlabeled.** There is no ambient "session" label. Labels attach to the underlying slot values, not to the accessor name.

---

## 9. Call-Site Attachment

A session schema attaches to an LLM-bridge call via `with { session: @schemaName }`.

### On a wrapping exe

```mlld
exe llm @planner(prompt, cfg) = @claude(@prompt, @cfg) with {
  session: @planner
}
```

Every call to `@planner(...)` auto-provisions a fresh session instance with the declared shape. Callers never mention the session.

### Directly on a call

```mlld
@claude(@prompt, @cfg) with { session: @planner }
```

Useful for one-off scripts or debugging. When the underlying exe has no wrapper-attached session, the caller's `session:` attaches directly. When a wrapper already attached a session, see §"Wrapper-owned default" below — the wrapper's attachment wins unless the caller explicitly opts into replacement via `override: "session"`.

### No attachment

Referencing a declared session name as a live instance when the enclosing frame did not attach that schema raises a clear error naming the missing schema. There is no silent no-op. Accessing the same name outside any LLM frame returns the schema itself (a type spec), not an error — schema usage stays available for cross-references like slot types and `inputs:` bindings.

### Mixed-provider harnesses

`@claude()` and `@opencode()` carry the same bridge lifecycle; both support `with { session: ... }` at the bridge layer. Wrapper exes that target either provider pick up session support without harness changes.

### Bridge activation gate

Today, bridge/MCP-config setup in `interpreter/eval/exec-invocation.ts` activates only when the call has `tools` or a writable shelf scope. With sessions, the activation condition widens to include session attachment:

```
bridge setup activates when:  tools present OR session attached OR shelf scope active
```

A call with `with { session: @planner, seed: {...} }` but no tools must still materialize the bridge frame so the session instance has a host. Resume flows follow the same rule: a resumed call with a session attached still creates a fresh frame and a fresh session instance, even though `tools = []`.

This is a mechanical widening of the existing gate — no new lifecycle semantics.

### Wrapper-owned default

When both a wrapping exe and a caller attach `session:`, the wrapper wins. Framework authors rely on their session invariants — a caller silently overriding them is a footgun. Callers who want to substitute a different session must opt in explicitly (e.g., `with { session: @alt, override: "session" }`). The `override` flag is a v1 opt-in; without it, the caller's `session:` is rejected at the `with` merge layer with a clear error.

---

## 10. Guard Integration (Middleware)

The payoff of session state is that `guard before/after` + session = middleware. No new interpreter concept.

### Write-commit semantics

- `before` guards that return `deny` do **not** commit their own session writes. The denial short-circuits the whole dispatch, including any writes made by the denying guard itself.
- `after` guards run only on non-denied dispatches. A dispatch denied by policy, a `before` guard, or the exe itself does not fire `after` guards — so counters and logs incremented in `after` guards never over-count.
- Writes that commit before a denial happens (e.g., an `after` guard earlier in declaration order) remain; only the denying frame's own writes are rolled back.

### Buffering model (implementation contract)

Inside a guard's execution frame, session writes go through a **per-guard buffer**, not directly to the committed store. The buffer commits atomically on guard allow-exit and discards on guard deny-exit.

Read-your-writes within a guard: when a guard writes and then reads the same slot in the same guard body, the read observes the pending (buffered) value. Implementation: session reads inside a guard frame overlay pending buffer entries on top of the committed store. Between-guard reads (from a later guard running in the same dispatch) see only what prior guards committed — each guard is a consistent unit.

**Trace events are buffered too.** A session write in a guard produces a `session:write` trace envelope attached to the buffer entry. On commit, the envelope emits through `env.emitRuntimeTraceEvent`. On discard, the envelope is dropped with the buffer entry. Denied guards never leak `session:write` events to trace output, SDK streams, or `result.sessions` snapshots. The same invariant holds for SDK `session_write` events.

This means write methods (`.set`, `.write`, `.update`, etc.) do not call trace emission directly — they hand the envelope to the active buffer, which emits on commit. Outside a guard frame (normal tool-callback body, seed writes at call start), there's no buffer, so writes and their trace events go direct. Frame detection is via `env.getSessionWriteBuffer()` returning undefined when no guard is active.

### Budget

```mlld
guard @budget before tool:w = when [
  @planner.runtime.tool_calls >= 20 => deny "budget exhausted"
  * => allow
]
```

### Tool-call counter

```mlld
guard @count after tool:w = when [
  * => [
    @planner.increment("runtime.tool_calls", 1)
    @planner.write("runtime.last_decision", @mx.op.name)
    => allow
  ]
]
```

### Terminal-tool latch

```mlld
guard @terminal after tool:w = when [
  @mx.op.name == "submit_final" => [
    @planner.write("runtime.terminal", "submit_final")
    => allow
  ]
  * => allow
]

guard @post_terminal before tool:w = when [
  @planner.runtime.terminal.isDefined() => deny "terminal tool already fired"
  * => allow
]
```

### Execution log

```mlld
guard @log after tool:w = when [
  * => [
    @planner.append("log", { tool: @mx.op.name, args: @mx.args, at: @now() })
    => allow
  ]
]
```

These idioms replace the bulk of rig's hand-written planner wrappers in `clean/rig/workers/planner.mld:261+`. The claim is specifically that per-wrapper boilerplate for budgets, counters, terminal latches, execution-logs, and denial logging collapses into guard + session idioms. Concerns that genuinely need a wrapper exe — result-shape coercion beyond `allow @transformed`, async kickoff patterns, cross-tool-call state machines that aren't pure accumulators — still live in wrappers. Expect ~80% collapse of boilerplate, not all of it.

---

## 11. Tracing and Observability

Session writes emit trace events visible under `--trace effects`:

```
session:write planner.runtime.tool_calls 1 → 2   [frame=@planner#3]
session:write planner.runtime.terminal "send_email"
```

### Redaction rules

Session values frequently carry taint labels (`untrusted`, `influenced`) or sensitivity labels (`secret`, `pii`, `sensitive`). Trace output must not leak these into logs:

- At `--trace effects` (default): unlabeled and `trusted`-labeled values are shown in full; values carrying any sensitivity or taint label are rendered as `<labels=[...] size=N>` placeholders. Slot path and label set are always visible — content is not.
- At `--trace verbose`: all content shown in full, with a banner warning that sensitive content is being logged. This mode is opt-in and intended for debugging sessions with synthetic or non-sensitive data.

Redaction respects the active policy's `defaults.unlabeled` setting: if `defaults.unlabeled: "untrusted"` is set, unlabeled values automatically carry `untrusted` and get redacted at `effects`. This is intentional — the whole point of that policy setting is to treat unlabeled as tainted by default, and trace output honors that classification. Scripts that want verbose trace content without sensitivity concerns should either not set `defaults.unlabeled: "untrusted"` or explicitly run with `--trace verbose`.

### Snapshot policy

On guard denial, trace output includes a session snapshot for the denying frame, subject to the redaction rules above. For large sessions (e.g., heavy execution logs), the snapshot is capped: slot names + sizes + label sets shown at `effects`; full content at `verbose`. Cap threshold is configurable but defaults to a size cap per slot rather than a count cap, so a big log doesn't blow up trace output.

On call exit, the final session state is emitted as a `session:final` event before teardown — useful for debugging defended agents without adding user-space logging. Same redaction rules apply.

Structured fields for the SDK event stream:

```ts
{
  type: "session_write",
  session_write: {
    session_name: string,   // canonical declaration name at origin — NOT a caller-side alias
    slot_path: string,      // e.g. "runtime.tool_calls"
    prev: unknown,
    next: unknown,
    frame_id: string,       // stable per-frame identifier
    timestamp: number
  }
}
```

Merge into `ExecuteResult`. Shape on the result is an array (not a name-keyed map), mirroring how `stateWrites` and `denials` are arrays:

```ts
result.sessions: Array<{
  name: string,              // canonical declaration name at origin
  originPath: string,        // source file path where the declaration lives (for disambiguation)
  finalState: Record<string, unknown>,  // slot → final labeled value
  frameId: string
}>
```

An array handles the multi-attachment case cleanly: if nested calls attach the same schema, each attachment produces a distinct entry in completion order. Most scripts have zero or one entries per name. Consumers iterate or filter.

**Identity vs name.** Internal bridge lookup uses `SessionDeclarationId` (stable identity assigned at declaration time — not name-dependent). External surfaces (`session_name` in events, `name` in `result.sessions`) use the canonical declaration name at origin, independent of any caller-side alias. Two modules independently declaring `var session @planner = {...}` produce two distinct declarations with distinct identities; if a single execution attaches both, they appear as separate entries in `result.sessions`, disambiguated by `originPath`.

**Buffered emission.** Session writes made inside a guard frame go through the guard's write buffer and emit trace / SDK events only on commit (guard allow-exit). Denied guards never leak `session.write` events to any observer. See §10 "Buffering model" for detail.

---

## 12. Concrete Migration: `clean/rig/session.mld`

### Before (current — 111 lines)

```mlld
import { @emptyState } from "./runtime.mld"

record @planner_agent_slot = { data: [value: object], validate: "strict" }
record @planner_query_slot = { data: [value: string], validate: "strict" }
record @planner_state_slot = { data: [value: object], validate: "strict" }
record @planner_runtime_slot = { data: [value: object], validate: "strict" }

shelf @plannerSession = {
  agent: planner_agent_slot?,
  query: planner_query_slot?,
  state: planner_state_slot?,
  runtime: planner_runtime_slot?
}

exe @slotValue(slotRef) = [
  let @value = @shelf.read(@slotRef)
  => when [
    !@value.isDefined() => null
    @value.value.isDefined() => @value.value
    @value.mx.data.value.isDefined() => @value.mx.data.value
    * => @value
  ]
]

exe @emptyPlannerRuntime() = [
  => { tool_calls: 0, invalid_calls: 0, terminal: null, last_decision: null }
]

exe @resetPlannerSession() = [ ... ]
exe @initializePlannerSession(agent, query) = [ ... ]
exe @plannerAgent() = [ => @slotValue(@plannerSession.agent) ]
exe @plannerQuery() = [ => @slotValue(@plannerSession.query) ]
exe @plannerState() = [ ... ]
exe @plannerRuntime() = [ ... ]
exe @writePlannerState(state) = [ ... ]
exe @writePlannerRuntime(runtime) = [ ... ]

export { @plannerSession, @emptyPlannerRuntime, @resetPlannerSession,
         @initializePlannerSession, @plannerAgent, @plannerQuery,
         @plannerState, @plannerRuntime, @writePlannerState, @writePlannerRuntime }
```

### After (proposed — ~10 lines)

```mlld
import { @emptyState } from "./runtime.mld"

record @plannerRuntime = {
  data: [tool_calls: number, invalid_calls: number, terminal: string?, last_decision: string?]
}

var session @planner = {
  agent: object,
  query: string,
  state: object,
  runtime: @plannerRuntime
}

export { @planner, @plannerRuntime }
```

### Caller-side changes

**Wrapper exe** (e.g. the planner entry in `clean/rig/workers/planner.mld`):

```mlld
>> Before: manual init
exe llm @runPlanner(agent, query, prompt) = [
  @initializePlannerSession(@agent, @query)
  => @claude(@prompt, { ... })
]

>> After: schema attached, auto-provisioned
exe llm @runPlanner(agent, query, prompt) = [
  => @claude(@prompt, { ... }) with { session: @planner }
]
```

The `@initializePlannerSession` call disappears. Required slots (`agent`, `query`) are populated via `seed:` at call start:

```mlld
exe llm @runPlanner(agent, query, prompt) = [
  => @claude(@prompt, { ... }) with {
    session: @planner,
    seed: { agent: @agent, query: @query }
  }
]
```

The runtime writes seed values into the fresh session instance through the normal type-validated write path before dispatching the first tool callback — see §7 (required slots) and §14 Q1 (resolved for v1). Without `seed`, required slots raise `MlldSessionRequiredSlotError` on first read.

**Tool callbacks** (e.g. in `workers/execute.mld`, `workers/planner.mld`):

```mlld
>> Before
var @runtime = @plannerRuntime()
@writePlannerRuntime({ ...@runtime, tool_calls: @runtime.tool_calls + 1 })

>> After — atomic helper form
@planner.increment("runtime.tool_calls", 1)

>> After — equivalent replace form
@planner.set(runtime: {
  ...@planner.runtime,
  tool_calls: @planner.runtime.tool_calls + 1
})
```

The getter/setter pairs collapse into direct `@planner` access with slot-name paths, and the read-modify-write idiom collapses further into `.increment` / `.append` / `.update`.

### What gets deleted

- All four `planner_*_slot` records (single-value wrapper types)
- `@slotValue` unwrap helper
- `@resetPlannerSession` (automatic on call exit)
- `@initializePlannerSession` (schema attachment handles this)
- `@plannerAgent`, `@plannerQuery`, `@plannerState`, `@plannerRuntime` getters (direct `@planner.<slot>` access)
- `@writePlannerState`, `@writePlannerRuntime` (direct `@planner.set(...)` writes)
- The global shelf singleton

### What stays

- `@emptyPlannerRuntime()` if any caller uses it to construct a fresh runtime value (but likely collapses into a literal at the write site)
- The `@plannerRuntime` record (now repurposed as the session slot's type)

---

## 13. Design Decisions (Rationale)

### Why `var session` and not `session @name =`

The broader consensus: **if a declaration is a JSON-shaped object with specific keys the runtime recognizes, it belongs in the `var <label>` family**. Only declarations with genuinely non-JSON syntax (record's `when [...]` section, guard's positional `BEFORE tool:w`, exe's `(params)` + body) earn their own top-level form. Session is JSON-shaped; it fits `var <label>`. Matches the `var tools` precedent. Does not require new top-level grammar, export/import spec, or editor tooling family. See the language-design discussion log for the full reasoning; `shelf` and `policy` are expected to migrate to `var shelf` / `var policy` on the same principle, though not as part of this spec.

### Why named-accessor (`@planner`) and not `@mx.session`

Earlier drafts routed access through `@mx.session`. That created a writability asymmetry under `@mx` — the first mutable drawer in a namespace otherwise defined as read-only ambient reflection of frame state. Naming the accessor after the declared var removes the asymmetry: `@mx.*` remains uniformly observed (read-only reflection), and session mutability lives on the named var's own surface. This also matches how every other declaration in mlld is accessed — `var tools @x`, `record @y`, `var secret @z` all use the declared name directly. Session should not break that convention to ride `@mx`.

### The dual-reading pattern

Session access uses **context-dependent name resolution**: the same identifier resolves differently based on the runtime context it appears in. Outside a live bridge frame, `@planner` is the schema; inside a frame that attached it, `@planner` is the live instance.

This is the same pattern as `@mx.op` and `@mx.args` — those accessors also mean different things depending on the nearest enclosing frame. The difference is that `@mx.*` resolution keys off an ambient name ("whatever the current frame's op is"), while session resolution keys off a user-chosen name ("whatever's attached under `@planner`"). Both use nearest-frame-wins nesting. The frame-resolution machinery already exists in the runtime for `@mx.*`; named sessions reuse it with the declared name as the lookup key.

Readers who are already comfortable with `@mx.op` changing meaning inside vs outside a guard block should find session resolution immediately familiar — it's the same mechanism exposed via a named declaration instead of an ambient accessor.

### Why per-LLM-call lifetime, not per-execution

Per-execution would reproduce the global-shelf aliasing problem across concurrent calls. Per-call is symmetric with the handle mint table (also per-call) and matches the conceptual unit "one LLM conversation." Cross-call persistence, if needed later, is a separate orthogonal mirror feature.

### Why no auto-init values in the schema declaration

Keep schema declarations type-only. Initial values belong at call time via an optional `seed:` peer (see §14). This keeps schemas exportable as pure type info and avoids a "which initial values apply when" question for imported schemas.

### Why writes go through method calls and not property assignment

Two reasons. (1) Property assignment on a var name would break the general rule that var bindings are immutable in mlld; allowing `@planner.runtime = ...` would invite confusion about whether the var itself changes. The method surface (`set` / `write` / `update` / `append` / `increment` / `clear`) makes clear the target is the runtime-owned session store, not the var binding. (2) Method-call writes emit trace events at a well-defined point with stable argument shapes; property-assignment interception is more fragile and harder to reason about in a language with lazy evaluation.

### Why the session dies on resume

Resume runs with `tools = []` and a fresh runtime frame (see `labels-policies-guards.md` §"Resume invariants"). A resumed call cannot fire the tool callbacks that would update a session, so carrying session state across resume would be dead weight. Matching the frame boundary keeps the model clean: one frame, one session.

### The per-call frame family

Three runtime drawers share the same frame boundary — they're all call-scoped ephemeral state tied to one LLM conversation:

- **Handle mint table** — per-call handle strings minted by display projection; die with the call.
- **Proof-claims-registry view** — per-call value-keyed registry used by `@policy.build` and the bridge for handle resolution.
- **Session instance** — per-call typed mutable accumulator declared via `var session`.

All three use nearest-enclosing-frame lookup. New primitives in this family should default to the same frame boundary.

---

## 14. Open Questions

### Q1. Initial values — `seed:` peer (resolved: **yes, v1**)

Shape: `with { session: @planner, seed: { agent: @a, query: @q } }`. The runtime materializes a fresh session instance from the declared schema, then writes each seed field through the normal type-validated write path before dispatching the first tool callback.

Without `seed`, required slots can only be populated by detecting "first callback" — which is exactly the init-state-machine pattern this primitive eliminates. Both reviewers flagged this as a v1 requirement; rig's migration depends on it.

Implementation note: seed writes count as writes for type validation (type mismatch raises at call start, before the first callback runs) and for trace events (emitted as `session:seed` so they're distinguishable from in-flight writes).

### Q2. Slot defaults in schema?

E.g., `runtime: @plannerRuntime = { tool_calls: 0, invalid_calls: 0 }`. Defaults apply if no seed writes the slot.

Recommendation: defer. Slot-default grammar complicates the schema form. For v1, require seed or first-write. Revisit if rig/other users request it.

### Q3. Snapshot on final `ExecuteResult`?

Should the session's final state appear in the SDK's `ExecuteResult` alongside `state_writes`, `denials`, etc.? Useful for post-execution inspection; costs one more field in the result shape.

Recommendation: yes, emit as `sessions: { [name]: finalState }`. Matches the "sessions are observable" goal without requiring a mirror.

### Q4. Can sessions be cleared mid-call?

Use cases: phase boundaries that want to reset a nested slot.

Recommendation: support `.clear("slot")` for a named slot (already reflected in §6); no whole-session clear (dies-with-call covers that). Matches current shelf behavior.

### Q5. Multiple sessions attached to one call?

`with { session: [@planner, @auditLog] }` — two named sessions on the same call, each reachable by its declared name (`@planner.set(...)` and `@auditLog.append(...)` both available inside callbacks).

Named access makes this clean in principle — each schema has its own lookup key, no collision. Deferred to a follow-up purely on grammar/implementation cost grounds: the single-session shape is simpler to parse and ship first. Revisit when a concrete use case demands it.

### Q6. Sessions on non-LLM calls?

Should `with { session: ... }` be supported on any exe, not just `exe llm`? E.g., a long-running shell workflow might want the same accumulator.

Recommendation: defer. The per-LLM-call lifetime is conceptually tied to the tool-callback model. Non-LLM exes already have their own var scope and don't have tool callbacks in the same sense. Revisit if a non-LLM use case emerges.

---

## 15. Implementation Checklist

1. Grammar — add `session` to the var label alphabet; parse `{ slot: TypeExpr }` RHS when the label is `session`; accept `@record[]` and `@record?` in slot types.
2. Schema validator — reuse the record-validation path for slot types; reject fact-minting for session slots (they're accumulators, not proof sources); reject `display:`/`when:` sections on session-targeted records.
3. Runtime frame — attach an optional session store to the LLM-bridge call frame, initialized from `with { session: @schema, seed?: {...} }`; serialize writes per-frame; tie lifetime to the frame (same boundary as handle mint table).
4. Named-accessor resolution — when a var name declared with `session` label is referenced inside a bridge-call frame, resolve to the live instance; outside any frame, resolve to the schema; inside a frame that did not attach this schema, raise a clear error.
5. Live-instance method surface — `.set(slots...)`, `.write(path, value)` (dotted string or path array), `.update(path, fn)`, `.append(path, value)`, `.increment(path, delta)`, `.clear(slot)`. All writes type-validate before committing.
6. Write-commit semantics — `before`-guard denial rolls back that guard's own session writes; `after` guards don't fire on denied dispatches.
7. Trace events — emit `session:seed` on seed writes at call start, `session:write` on every in-flight committed write, `session:final` on call exit. Apply redaction rules per §11.
8. SDK wire format — add `sessions` to `ExecuteResult` and `session_write` to the event stream; event payload includes slot path, session name, label set, prev/next values subject to redaction.
9. `with` merge — wrapper `session:` wins over caller `session:` unless caller passes `override: "session"` (rejected at merge with clear error otherwise).
10. Docs — add a `sessions` section to the labels/policies/guards guide; update `sdk/SPEC.md`.
11. Tests — fixtures under `tests/cases/feat/session/` covering: basic read/write, seed at call start, nesting (inner-only and same-name-at-multiple-levels), concurrency isolation (parallel fan-out), resume isolation, type validation errors, guard integration (budget, counter, terminal latch, log), write-commit on deny, override rejection, trace redaction, atomic helpers.

---

## 16. Hand-off Notes for Rig Migration

After this primitive lands:

- `clean/rig/session.mld` collapses to the ~10-line form in §12
- `@initializePlannerSession` / `@resetPlannerSession` callers in `clean/rig/workers/planner.mld` and `clean/rig/workers/execute.mld` drop their init/reset lines; initial `agent` / `query` values move into `seed:` on the wrapper exe
- Getter/setter calls (`@plannerRuntime()`, `@writePlannerRuntime(...)`) become `@planner.runtime` / `@planner.set(runtime: ...)` / atomic helpers (`@planner.increment(...)`, `@planner.append(...)`)
- Budget checks, tool-call counters, terminal latch, execution log: migrate to guard + session idioms per §10
- The repetitive planner wrappers in `workers/planner.mld:261+` collapse for the ~80% of their content that is budget/counter/log/latch boilerplate. Wrapper bodies that carry result-shape coercion, async kickoff patterns, or cross-tool-call state machines stay — those aren't boilerplate.
- No harness-module changes needed (`modules/claude/index.mld`, `modules/opencode/index.mld` route through the bridge layer where session lifecycle lives)

### Check existing records before reusing as session slot types

Per §7, records used as session slot types must be **input-style** — no `display:` or `when:` sections. Rig's existing record declarations (e.g. in `clean/rig/records.mld`, suite-specific record modules) frequently carry `display:` clauses for LLM-boundary projection; those records cannot be reused directly as session slot types.

Before migration, audit the records rig will reference from the session schema:

- If the record has no `display:` / `when:` → reusable as-is (e.g., `@plannerRuntime` as drafted in §12)
- If the record has `display:` / `when:` → either (a) extract a pure input-style record for the session slot, or (b) accept that the session slot types a subset/projection and declare a new accumulator-only record alongside the display-carrying one

The `@plannerRuntime` record in the §12 after-form is already input-only, so it drops in cleanly. Records like `@email_msg` (display-bearing) are output-bound and should not be imported into session slot types — accumulate their payloads into session slots with accumulator-only record types instead.

Deletion estimate: rig loses ~300+ lines net across `session.mld`, `workers/planner.mld`, `workers/execute.mld`, and `tooling.mld`. More importantly, the removed bookkeeping is also the source of known bug classes (state aliasing in ticket m-5683, null-callback families in UT14). **Killing the boilerplate kills the bug class** — a better outcome than the raw LOC number suggests.
