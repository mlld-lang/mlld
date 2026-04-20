# Implementation Plan: `var session @name = {...}`

**Spec:** `spec-session-scoped-state.md`
**Dossiers:** `plan-var-session-dossier-{shelf,bridge-frame,mx-lookup,grammar-archaeology,guard-dispatch,records,trace,sdk-tests}.md`

---

## Overview

`var session` introduces a new labeled-var form declaring a typed, per-LLM-call mutable state container. The schema (JSON-shaped `{ slot: TypeExpr }`) binds to LLM-bridge calls via `with { session: @name, seed: {...} }`; the runtime materializes a fresh instance per call, attached to the same per-call frame that owns the handle mint table and proof-claims-registry view. The declared name resolves context-dependently: schema outside a live frame, live instance (with `.set/.write/.update/.append/.increment/.clear` methods) inside one.

**Estimated effort:** 15–23 person-days for v1. Compressible to a handful of focused agent sessions given these dossiers.

**Shipping shape:** 8 phases, mostly linear dependency. Phases 1–2 land together as a useful-but-silent baseline (declarations parse, instances materialize, but no access API yet). Phase 3–4 make sessions functional. Phases 5–8 add observability, guard integration, SDK surface, and rig migration.

---

## Dependency Graph

```
Phase 1 (grammar + declaration)  ────┐
                                     ├──→ Phase 2 (bridge attachment)  ──┐
                                     │                                   │
                                     │                                   ├──→ Phase 3 (named-accessor reads)
                                     │                                   │        │
                                     │                                   │        ▼
                                     │                                   │   Phase 4 (write methods)
                                     │                                   │        │
                                     │                                   │        ├──→ Phase 5 (trace + redaction)
                                     │                                   │        │
                                     │                                   │        └──→ Phase 6 (guard write-commit)
                                     │                                   │                 │
                                     │                                   │                 ▼
                                     │                                   │            Phase 7 (SDK wire format)
                                     │                                   │                 │
                                     │                                   │                 ▼
                                     │                                   │            Phase 8 (rig migration + docs)
                                     │                                   │
                                     └───────────────────────────────────┘
```

Phases 3 and 4 can partially parallelize within one engineer (resolution and method dispatch touch adjacent files). Phases 5 and 6 can parallelize after Phase 4. Phase 7 depends on Phase 5 (events). Phase 8 depends on everything.

---

## Phase 1 — Grammar, Schema Validator, Declaration Registry

**Goal:** `var session @name = {...}` parses, validates, registers as a named schema. Declared sessions are inert at runtime — no attachment, no instances, no methods. Exports/imports across modules work.

**Ship criterion:** Parser accepts the syntax; schema validator rejects bad schemas with clear errors; imported session schemas resolve by declaration identity.

### Dependencies
None.

### Files to edit (ordered)

| # | File | Change | Reference |
|---|---|---|---|
| 1 | `grammar/patterns/security.peggy` line 39 | Add `'session'` to reserved list | `plan-var-session-dossier-grammar-archaeology.md` §"Grammar Extension Checklist" step 1 |
| 2 | `grammar/directives/var.peggy` line 9 | Add `sessionSegment:(HWS "session")?` parsing | step 2 |
| 3 | `grammar/directives/var.peggy` lines 253–254 | Set `metaInfo.isSessionLabel = true` when session keyword matched | step 3 |
| 4 | `core/types/var.ts` | Add `isSessionLabel?: boolean` to `VarMeta` | step 4 |
| 5 | `core/types/session.ts` (NEW) | Define `SessionDefinition`, `SessionSlotBinding`, `SerializedSessionDefinition`, `SessionFrameInstance` types (placeholder shell for Phase 2) | `plan-var-session-dossier-shelf.md` §"Extension Points" #2 |
| 6 | `core/validation/session-definition.ts` (NEW) | Validate session schema: field types, record-ref resolution, optional-suffix parsing, array syntax (`@record[]`). Reject records with `display:`/`when:` via `canUseRecordForSessionSlot()`. | `plan-var-session-dossier-records.md` §"Extension Points" #1, #3 |
| 7 | `core/types/record.ts` (near line 485) | Add `canUseRecordForSessionSlot(definition: RecordDefinition): boolean` | `plan-var-session-dossier-records.md` §"Session-Bound Type Classifier" |
| 8 | `interpreter/eval/var.ts` (~line 180) | Extract `isSessionLabel` flag; enforce mutual exclusion with `secret`/`untrusted`/`pii`; pass to RHS dispatcher | `plan-var-session-dossier-grammar-archaeology.md` step 5, 6 |
| 9 | `interpreter/eval/var/rhs-dispatcher.ts` line 76 | Add `isSessionLabel?: boolean` to `RhsDispatcherDependencies` | step 7 |
| 10 | `interpreter/eval/var/rhs-dispatcher.ts` `evaluate()` | Add elif branch: if `isSessionLabel`, call session schema validator and return `{type: 'resolved', handler: 'object', value: schema}` | step 7 |
| 11 | `interpreter/eval/var/session-schema.ts` (NEW) | Post-parse validator: normalize object into `SessionDefinition` with slot types, defaults, required flags | step 8 |
| 12 | `interpreter/eval/var/variable-builder.ts` | Mark session schema variables with `internal.isSessionSchema === true` + `internal.sessionSchema` holding parsed schema | step 9 |
| 13 | `interpreter/env/Environment.ts` | Add `registerSessionDefinition(name, definition)` and `getSessionDefinition(name)` parallel to `registerShelfDefinition` | `plan-var-session-dossier-shelf.md` §"Extension Points" #3 |
| 14 | `interpreter/eval/import/variable-importer/ModuleExportSerializer.ts` line 149 | Detect `variable.internal?.isSessionSchema === true`, call `serializeSessionDefinition` | `plan-var-session-dossier-shelf.md` §"Extension Points" #11 |
| 15 | `interpreter/eval/import/VariableImporter.ts` line 319 | Detect `isSerializedSessionDefinition`, register records + session definition in target Environment | step 11 |
| 16 | `core/types/session.ts` | Add `serializeSessionDefinition(env, definition): SerializedSessionDefinition` and `isSerializedSessionDefinition(x): x is SerializedSessionDefinition` — analogs to shelf serialization | `plan-var-session-dossier-shelf.md` §"Module Export/Import" |

### Tests

Create `interpreter/eval/session-schema.test.ts` (new file):
- Basic schema parsing: `var session @planner = { runtime: @plannerRuntime, query: string }`
- Primitive slot types: `string`, `number`, `boolean`, `object`, `array`
- Optional suffix: `slot?`, `@record?`
- Array typing: `@record[]`, `string[]`
- Record reference resolution
- Reject record with `display:` in session slot: `MlldSessionSlotTypeError`
- Reject record with `when:` in session slot
- Reject conflicting labels: `var session,secret @x = {...}` fails
- Mutual exclusion with `untrusted`, `pii`

Create fixture scenarios at `tests/cases/feat/session/declaration/`:
- `basic-declaration/` — schema with mixed types, verify registration
- `array-slot/` — `@record[]` and `string[]` slot types
- `optional-slot/` — `slot?` semantics
- `imported-schema/` — declare in module A, import in module B, verify identity preserved
- `invalid-display-record/` (in `tests/cases/exceptions/session/`) — reject display-bearing record

### Checkpoint

- Parser accepts the syntax, AST carries `isSessionLabel: true`
- Schema validator catches every invalid shape with readable errors
- Imported schemas resolve by declaration identity
- No runtime behavior yet: declared sessions referenced in any context error cleanly
- Grammar regeneration works: `npm run build:grammar` passes

**Estimate: 1–2 days**

---

## Phase 2 — Bridge Attachment + Lifecycle

**Goal:** `with { session: @planner, seed: {...} }` on an LLM call materializes a session instance on the bridge frame, runs seed writes through validated-write path, and tears down on exit. No access API yet — but instance exists, and lifecycle is correct.

**Ship criterion:** Session instance materializes and disposes correctly under normal exit, guard denial, SDK cancel, and uncaught throw. Resume creates a fresh session instance (verified). Wrapper-owned session default works (caller override without explicit flag fails).

### Dependencies
Phase 1.

### Files to edit

| # | File | Change | Reference |
|---|---|---|---|
| 1 | `interpreter/env/Environment.ts` (~line 420) | Add `private sessionInstances?: Map<SessionDeclarationId, SessionInstance>;` attached to the per-call frame. Add `attachSessionInstance`, `getSessionInstance(declId)`, `disposeSessionInstance(declId)` methods. | `plan-var-session-dossier-bridge-frame.md` §"Extension Points" #1, `plan-var-session-dossier-mx-lookup.md` §"Extension Points" #1 |
| 2 | `interpreter/session/runtime.ts` (NEW) | Session lifecycle functions: `materializeSession(schema, seed, env)`, `disposeSession(instance, env)`, `applySeedWrites(instance, seed, env)`. Uses `validateRecordFieldValues` from shelf (extracted in Phase 2.5). | `plan-var-session-dossier-shelf.md` §"Session Type Validation — REUSABLE" |
| 3 | `interpreter/eval/exec/scoped-runtime-config.ts` line 28 | Extend `applyInvocationScopedRuntimeConfig` to handle `session` and `seed` keys. Resolve `session` reference to its declaration; materialize instance; call `attachSessionInstance`; on wrapper/caller conflict, enforce "wrapper wins unless caller passes `override: 'session'`"; if caller passes mismatched override, throw clear error. | `plan-var-session-dossier-bridge-frame.md` §"With-Clause Routing Map" |
| 4 | `interpreter/eval/exec-invocation.ts` (~line 4179) | **Widen bridge activation gate** from `tools present OR shelf scope active` to `tools present OR session attached OR shelf scope active`. Session-only calls must still set up a bridge frame so the session instance has a host. Spec §9 "Bridge activation gate." | `plan-var-session-dossier-bridge-frame.md` §"Frame Entry" |
| 5 | `interpreter/eval/exec-invocation.ts` (~line 4192, after `createCallMcpConfig`) | After session materialization, register cleanup: `execEnv.registerScopeCleanup(() => disposeSession(instance, execEnv))`. Materialization must happen BEFORE first tool callback dispatch. | `plan-var-session-dossier-bridge-frame.md` §"Lifecycle Hook Points" |
| 6 | `interpreter/eval/exec-invocation.ts` (~line 4202, isLlmResumeContinuation branch) | Confirm resume creates fresh frame → fresh session instance. Session-attached resume must also trigger the widened bridge gate (session alone is enough to activate). Add assertion/test that old session state does not leak. | `plan-var-session-dossier-bridge-frame.md` §"Resume Invariant" |
| 6 | `interpreter/shelf/runtime.ts` lines 501–600 | Extract `validateShelfRecordValue` core logic into shared helper `validateRecordFieldValues(options)` in new `interpreter/records/validate-fields.ts`. Shelf continues to use it with shelf-specific error messages; session consumes same helper. | `plan-var-session-dossier-shelf.md` §"Session Type Validation — REUSABLE" |
| 7 | `core/types/session.ts` | Flesh out `SessionInstance` class: per-slot storage as labeled envelopes, `has(slot)`, `get(slot)`, `set(slot, value)` internal API (used by method dispatch later). Not user-facing yet. | `plan-var-session-dossier-shelf.md` §"Extension Points" #2 |

### Tests

Create `tests/cases/feat/session/lifecycle/`:
- `seed-at-start/` — seed values populated before first tool callback runs
- `seed-type-mismatch/` (in `exceptions/`) — runtime error at call start, BEFORE dispatch
- `dispose-on-normal-exit/` — verify cleanup called
- `dispose-on-cancel/` — SDK cancel triggers cleanup
- `fresh-on-resume/` — resume gets new instance; prior state not visible
- `session-only-activates-bridge/` — `with { session: @x, seed: {...} }` with no `tools:` still materializes a bridge frame
- `wrapper-owned-default/` — wrapper's session wins; caller's conflicting `session:` without `override:` raises error at `with` merge
- `caller-override-explicit/` — with `override: "session"`, caller's session replaces wrapper's
- `caller-override-missing-flag/` (in `exceptions/`) — error: "session key conflicts; use override: 'session' to replace"

**Note:** `required-slot-no-seed` is moved to Phase 3 (read-path behavior). Phase 2 only verifies seed writes land and instances materialize; the read-time error that fires when a required slot is accessed unset is exercised once the access API exists in Phase 3.

Add scripted test harness `tests/integration/session-lifecycle.test.ts` using the mock LLM harness identified in `plan-var-session-dossier-sdk-tests.md` §"Bridge / LLM-Call Test Harness".

### Checkpoint

- Session materializes at bridge entry with seed values written through type validation
- Attaches to the per-call frame's `sessionInstances` map keyed by declaration identity
- Disposes on every exit path
- Wrapper-owned default enforced
- Resume creates fresh instance (test passes)

**Estimate: 2–3 days**

---

## Phase 3 — Named-Accessor Resolution (Reads Only)

**Goal:** Declared session names resolve context-dependently — schema outside any bridge frame, live instance inside one. Dotted field access on live instance works (`@planner.runtime.tool_calls`). No write methods yet.

**Ship criterion:** `var @count = @planner.runtime.tool_calls` reads the current instance value inside a callback; `var @schema = @planner` outside a frame returns the schema. Required-slot read before write raises `MlldSessionRequiredSlotError`. Optional-slot read before write returns `undefined`. Nested frames resolve to the nearest enclosing one. Schema-valued positions (`with { session: @planner }`, slot type references, exports) always return the schema.

### Dependencies
Phase 2.

### Files to edit

| # | File | Change | Reference |
|---|---|---|---|
| 1 | `interpreter/env/VariableManager.ts` (~line 292, near `@mx` special case) | Add session lookup before `@mx`: if variable name matches a session declaration registered in Environment, inspect the **nearest enclosing bridge frame only** for an attached instance of that declaration identity. Found → return live-instance Variable. If the nearest frame exists but did not attach this schema → error `MlldSessionNotAttachedError`. Outside all bridge frames → return schema Variable. | `plan-var-session-dossier-mx-lookup.md` §"Extension Points" #2 |
| 2 | `interpreter/env/ContextManager.ts` (or new `interpreter/session/frame-lookup.ts`) | Add `getNearestFrameSessionInstance(declId: SessionDeclarationId, bridgeStack): SessionInstance \| undefined`. Inspect only the top bridge frame; do not walk past it. | spec §3/§5 strict one-frame lookup |
| 3 | `interpreter/env/Environment.ts` | Expose `getNearestFrameSessionInstance(declId): SessionInstance \| undefined` keyed off the current bridge frame / current lifecycle child; no outer-frame fallback. | `plan-var-session-dossier-bridge-frame.md` §"Bridge Stack" |
| 4 | `core/types/session.ts` | Add context-aware field access for `SessionInstance`: `.readSlot(path: string \| string[]): unknown` returning labeled value envelope; raises `MlldSessionRequiredSlotError` for unset required. | `plan-var-session-dossier-records.md` §"Required vs Optional" |
| 5 | `interpreter/utils/field-access.ts` | Add case for session-instance value: when field access applies to a `SessionInstance`, route through `.readSlot(path)`. Preserve `.mx.labels` from the stored envelope. | `plan-var-session-dossier-shelf.md` §"Identity Preservation in Field Access" |
| 6 | `interpreter/eval/exec/scoped-runtime-config.ts` (schema-valued positions) | When resolving `session:` key in `with { ... }`, explicitly use schema, not live instance: look up by name via `Environment.getSessionDefinition`. Same for slot type references in other declarations. | `plan-var-session-dossier-mx-lookup.md` §"Dual-Reading Pattern" |
| 7 | `interpreter/eval/import/*` | Ensure export/import paths always see schema (declaration), never live instance. Already true if schema is the var's value; confirm and add test. | — |

### Tests

Create `tests/cases/feat/session/read-access/`:
- `live-instance-inside-frame/` — read populated slot inside callback returns value
- `schema-outside-frame/` — same name outside returns schema declaration
- `required-slot-unset-read/` (in `exceptions/`) — `MlldSessionRequiredSlotError` (moved from Phase 2)
- `optional-slot-unset-read/` — returns `undefined`, no error
- `bare-name-snapshot/` — `var @sess = @planner` captures current state as an immutable snapshot; later mutations via `@planner.set(...)` not visible through `@sess`
- `nested-frame-attached-inner/` — inner call attached `@planner`; inner callbacks see inner's instance
- `nested-frame-not-attached-inner/` (in `exceptions/`) — inner call did NOT attach `@planner`, outer did; inner access raises `MlldSessionNotAttachedError`. **Lookup stops at the nearest bridge frame — no walking to outer. This is the spec-§5 isolation invariant.**
- `nested-frame-different-names/` — inner attaches `@subtask`, outer attaches `@planner`; inside inner, `@subtask` resolves, `@planner` raises `MlldSessionNotAttachedError`
- `label-propagation/` — `@planner.runtime.tool_calls.mx.labels` reflects label set at write time
- `schema-in-with-clause/` — `with { session: @planner }` uses schema even inside a frame that has `@planner` attached (schema-valued position)

### Checkpoint

- Dotted field access works inside live frames
- Schema-valued positions always resolve to schema
- Error messages clear for unset-required and not-attached cases
- Nesting honors spec §5 isolation

**Estimate: 2–3 days**

### Risk note

This is the highest-risk phase per the `@mx.*` dossier's generalizability verdict. The existing `@mx.*` walker is hardcoded per accessor and not directly reusable. Named-accessor resolution is novel code. Mitigation: strict typing on declaration identity (not string matching), comprehensive nesting tests, explicit schema-valued-position list in spec §3.

---

## Phase 4 — Write Method Surface

**Goal:** Session writes work: `.set`, `.write`, `.update`, `.append`, `.increment`, `.clear`. Each validates against slot type; every write emits trace events (stubbed for Phase 5). Path arrays accepted alongside dotted strings.

**Ship criterion:** Every method in §6 of the spec works with correct type validation errors. Write-then-read round-trips values with preserved labels. `.clear()` on a required slot allows the clear but subsequent reads raise `MlldSessionRequiredSlotError`.

### Dependencies
Phase 3.

### Files to edit

| # | File | Change | Reference |
|---|---|---|---|
| 1 | `interpreter/session/methods.ts` (NEW) | Implement the six methods. Each takes `(instance, args, env)`, validates, commits. `.update(path, @fnRef)` invokes the referenced exe with current value and takes the result. | `plan-var-session-dossier-shelf.md` §"Shelf Builtin API" (template) |
| 2 | `core/types/session.ts` | Add write methods to `SessionInstance`: `setSlot`, `writeSlot`, `updateSlot`, `appendToSlot`, `incrementSlot`, `clearSlot`. Use shared validator from Phase 2.5. | — |
| 3 | `interpreter/eval/exec/builtins.ts` (or equivalent method dispatch) | When field access resolves to a live session instance followed by a method call (e.g., `@planner.set(...)`), dispatch to the right method in `interpreter/session/methods.ts`. | `plan-var-session-dossier-shelf.md` §"Shelf Builtin API" |
| 4 | `interpreter/session/path.ts` (NEW) | Path parsing: accept dotted strings (`"runtime.tool_calls"`) and path arrays (`["runtime", "tool_calls"]`). Canonicalize to internal path array. | — |
| 5 | `core/types/session.ts` | Trace hooks stubbed — methods call `emitSessionWriteEvent(env, ...)` with a no-op for Phase 4; real emission wired in Phase 5. | — |
| 6 | `interpreter/session/methods.ts` | `.update` invokes an exe reference: reuses existing exe-invocation machinery with one positional arg (current slot value). Validates result against slot type before committing. **Reject non-pure exes at call time** — only `js`, `node`, `mlld-exe-block`, `mlld-when` are accepted; `llm` exes and any exe that can dispatch tool callbacks raise `MlldSessionUpdateExecutableError`. This keeps commit semantics simple (update cannot re-enter the bridge). | spec §6 ".update restrictions" |
| 7 | `interpreter/session/methods.ts` | `.clear(slot)` for required slots: clears the slot (makes it unset). Subsequent reads raise `MlldSessionRequiredSlotError`. Framework pattern: "force next phase to reseed." | `plan-var-session-dossier-records.md` (clear semantics) |

### Tests

Create `tests/cases/feat/session/write-methods/`:
- `set-whole-slot/` — `.set(runtime: @new)` replaces whole slot
- `set-multiple-slots/` — `.set(runtime: @new, state: @otherNew)` atomic-ish
- `write-dotted-path/` — `.write("runtime.tool_calls", @n)`
- `write-path-array/` — `.write(["runtime", "tool_calls"], @n)` (same result)
- `update-functional/` — `.update("runtime", @bumpCalls)` where `@bumpCalls` is a declared `js`/`node`/`mlld-exe-block` exe
- `update-result-type-mismatch/` (in `exceptions/`) — `@bumpCalls` returns wrong shape; error
- `update-llm-exe-rejected/` (in `exceptions/`) — `.update("runtime", @someLlmExe)` raises `MlldSessionUpdateExecutableError`; only pure/local exes accepted
- `increment-numeric/` — `.increment("runtime.tool_calls", 1)`
- `increment-non-numeric-slot/` (in `exceptions/`) — error
- `append-to-array/` — `.append("log", {tool: "x"})`
- `append-non-array-slot/` (in `exceptions/`) — error
- `clear-optional/` — subsequent read returns `undefined`
- `clear-required/` — `.clear("runtime")` on required slot; subsequent read raises
- `label-preservation/` — write `untrusted` value; read back retains label

### Checkpoint

- All six methods work with correct validation
- Path arrays and dotted strings both accepted
- `.update` invokes exe and validates result
- Labels preserved through write/read cycles
- `.clear` on required slot has documented "reseed needed" behavior

**Estimate: 2–3 days**

---

## Phase 5 — Trace Events + Redaction + Deferred Emission

**Goal:** Session writes emit structured trace events under `--trace effects` and `--trace verbose`. Label-aware redaction prevents sensitive content from leaking at `effects`. Respects `defaults.unlabeled: "untrusted"` policy automatically. **Trace emission for session writes goes through a commit-aware path so Phase 6's guard buffering rolls back both the write and its trace event atomically.**

**Ship criterion:** With `defaults.unlabeled: "untrusted"`, an unlabeled value written to a session slot shows as `<labels=[untrusted] size=N>` placeholder at `effects` and full content at `verbose`. With no such policy, unlabeled values show in full at both levels. `secret`/`pii`/`influenced` always redacted at `effects`. Writes that end up discarded (anticipating Phase 6) never produce observable trace output.

### Dependencies
Phase 4. Produces infrastructure that Phase 6 will use — the commit-aware emission path is designed in this phase even though no buffer is present yet.

### Files to edit

| # | File | Change | Reference |
|---|---|---|---|
| 1 | `core/types/trace.ts` | Add to `RuntimeTraceEventName` enum: `'session.seed'`, `'session.write'`, `'session.final'`. Add payload specs to `RuntimeTraceEventSpecMap` with `level: 'effects'`, `category: 'session'`. | `plan-var-session-dossier-trace.md` §"Extension Points" |
| 2 | `interpreter/tracing/events.ts` | Add factories: `traceSessionSeed(data)`, `traceSessionWrite(data)`, `traceSessionFinal(data)`. Mirror existing `traceShelfWrite` pattern. | same |
| 3 | `interpreter/tracing/redact.ts` (NEW) | Add `redactTraceValueForLevel(value, level, policy)` that (a) at `verbose` returns unmodified, (b) at `effects` checks `.mx.labels` and returns `{labels: [...], size: N}` placeholder for sensitive/tainted values, (c) otherwise passes through to `summarizeRuntimeTraceValue`. | `plan-var-session-dossier-trace.md` §"Redaction Utility" |
| 4 | `interpreter/session/trace-envelope.ts` (NEW) | **Commit-aware emission path.** Expose `emitOrBufferSessionTrace(env, envelope)`: if `env.getSessionWriteBuffer()` returns a buffer (Phase 6 case), attach the envelope to the pending buffer entry so it commits/discards with the write. Otherwise, emit directly via `env.emitRuntimeTraceEvent`. This is the central rule: **never emit a session.write envelope directly from a write method; always route through this helper.** | spec §10 "Buffering model" |
| 5 | `interpreter/session/methods.ts` | Wire trace emission via `emitOrBufferSessionTrace`: each write method constructs the `traceSessionWrite` envelope with redacted `prev`/`next` and hands it to the helper. No direct `emitRuntimeTraceEvent` calls from write methods. | — |
| 6 | `interpreter/session/runtime.ts` (Phase 2 file) | Seed writes emit `traceSessionSeed` directly (seeding runs before any guard frame, so no buffer; use `env.emitRuntimeTraceEvent` directly or pass through `emitOrBufferSessionTrace` which will no-op the buffer case). | — |
| 7 | `interpreter/session/runtime.ts` (disposeSession path) | On frame exit, emit `traceSessionFinal` with redacted final state per slot. Direct emission (no buffer relevant at teardown). | — |
| 8 | `interpreter/hooks/guard-pre-hook.ts` denial path | On guard denial, emit a `session.final` snapshot of the denying frame's session state (redacted) before unwind — this is the **committed** state, not the denied guard's pending writes. | `plan-var-session-dossier-trace.md` §"Snapshot policy" |

### Tests

Create `tests/cases/feat/session/trace/`:
- `trace-effects-unlabeled/` — unlabeled values visible at `--trace effects`
- `trace-effects-untrusted/` — `untrusted` values redacted at `effects`
- `trace-effects-secret/` — `secret` values redacted at `effects`
- `trace-verbose-all/` — everything visible at `--trace verbose`
- `trace-defaults-unlabeled-policy/` — with `defaults.unlabeled: "untrusted"`, unlabeled values redacted at `effects`
- `trace-snapshot-on-denial/` — guard denial triggers `session.final` with redacted snapshot
- `trace-size-cap/` — heavy execution-log slot bounded by size cap at `effects`

### Checkpoint

- Trace events emit for seed, write, final
- Redaction correctly distinguishes sensitive from non-sensitive by label
- `defaults.unlabeled: "untrusted"` interaction works without explicit policy re-consultation at emit
- Snapshot size cap applied
- No sensitive content leaks at `effects` in any test

**Estimate: 1–2 days**

### Risk note

Security-adjacent. Dedicate explicit tests with deliberately labeled sensitive data. A bug here is a real security incident, not just a bug.

---

## Phase 6 — Guard Write-Commit Semantics

**Goal:** `before` guards that return `deny` do NOT commit their own session writes. `after` guards don't run on denied dispatches (already structurally true — verify). Earlier committed writes in the same phase remain visible.

**Ship criterion:** A budget-counter guard that writes `@planner.increment(...)` and then denies leaves the session unchanged. A budget-counter guard that writes and then allows commits the write. Multi-guard scenarios: guard N denying does NOT roll back guard N-1's committed writes.

### Dependencies
Phase 4 (write methods) and Phase 5 (trace events) — Phase 6 needs both to demonstrate correct buffering + observable outcomes.

### Files to edit

| # | File | Change | Reference |
|---|---|---|---|
| 1 | `core/types/session.ts` or `interpreter/session/write-buffer.ts` (NEW) | Add `SessionWriteBuffer` with `queue(entry, traceEnvelope)`, `commit(store, traceEmitter)`, `discard()`, `clear()`, `readOverlay(path)`. Each entry pairs a write with its trace envelope so both commit or discard atomically. `readOverlay(path)` returns pending buffer entry matching this path for same-guard read-your-writes. | `plan-var-session-dossier-guard-dispatch.md` §"Session Write Buffer Contract" + spec §10 "Buffering model" |
| 2 | `interpreter/hooks/guard-pre-runtime.ts` (~line 44) | After guard env created and parent vars inherited, attach a fresh write buffer: `guardEnv.attachSessionWriteBuffer()`. | `plan-var-session-dossier-guard-dispatch.md` §"Extension Points" |
| 3 | `interpreter/session/methods.ts` | When a write method is called, check if the current env has a `sessionWriteBuffer`. If yes, queue the entry + its trace envelope instead of committing directly. If no, write and emit directly. Trace envelope routing already goes through Phase 5's `emitOrBufferSessionTrace`, which picks up the buffer automatically. | `plan-var-session-dossier-guard-dispatch.md` §"Session write interception" |
| 4 | `interpreter/session/read-path.ts` | **Same-guard read-your-writes:** when resolving a session read inside a guard frame, first check `env.getSessionWriteBuffer()?.readOverlay(path)` before consulting the committed store. Overlay hit → return pending value; miss → fall through to store. | spec §10 "Read-your-writes" |
| 5 | `interpreter/hooks/guard-decision-reducer.ts` (~line 129) | On `'deny'` decision, call `env.discardSessionWriteBuffer()` before setting state. **Discard also drops buffered trace envelopes** — no `session.write` event observable for denied guard's writes. | `plan-var-session-dossier-guard-dispatch.md` §"Denial rollback" |
| 6 | `interpreter/hooks/guard-pre-hook.ts` (~line 730) | On guard `'allow'` and no aggregate denial, call `env.commitSessionWriteBuffer()`. Commit flushes writes to store AND emits buffered trace envelopes in order. | `plan-var-session-dossier-guard-dispatch.md` §"Allow commit" |
| 7 | `interpreter/hooks/guard-pre-hook.ts` retry path | On retry, discard current buffer (guard re-runs fresh). | `plan-var-session-dossier-guard-dispatch.md` §"Retry Loops" |
| 8 | `interpreter/env/Environment.ts` | Add `attachSessionWriteBuffer`, `getSessionWriteBuffer`, `commitSessionWriteBuffer`, `discardSessionWriteBuffer` methods. Buffer scoped to current env (not inherited). | — |

### Tests

Create `tests/cases/feat/session/guard-integration/`:
- `budget-counter-allow/` — counter increments on allow
- `budget-counter-deny/` — counter does NOT increment on deny
- `terminal-tool-latch/` — post-guard writes `runtime.terminal`; subsequent pre-guard denies if set
- `execution-log-append/` — each tool call appends; denied call does not append
- `multi-guard-pre-deny/` — guard 1 writes and allows (committed); guard 2 writes and denies (rolled back). Verify guard 1's write survives and guard 2's does not.
- `privileged-override-commit/` — privileged guard writes after policy denial override; writes commit
- `retry-loop-fresh-buffer/` — retry starts with fresh buffer; prior attempt's writes discarded
- `after-guard-on-denied-dispatch/` — after-guard's session writes never happen (dispatch denied before after phase)
- `streaming-no-after-guard-writes/` — streaming path skips after-guards; no session writes from that layer
- `same-guard-read-your-writes/` — within one guard body, a write followed by a read observes the pending value (overlay). After guard commits, subsequent guards see the same value. After guard denies, no value remains.
- `deny-drops-trace-event/` — guard writes, denies; assert no `session.write` trace event for that write in either `--trace effects` output OR `result.traceEvents`. This closes the observable-leak gap between Phase 5 and Phase 6.
- `deny-drops-sdk-event/` — same as above but asserting on SDK `session_write` event stream

### Checkpoint

- Deny rolls back denying guard's writes only
- Allow commits buffered writes atomically
- After-guards fire only on non-denied dispatches
- Retry uses fresh buffer
- Privileged overrides compose correctly

**Estimate: 3–4 days**

### Risk note

This is the highest-novelty phase per the guard-dispatch dossier — no precedent for transactional guard-scoped state. Subtle bugs produce silent counter-over-count. Dedicate strong test coverage including concurrent-write scenarios (even though current dispatch is sequential).

---

## Phase 7 — SDK Wire Format

**Goal:** `sessions: Array<{name, originPath, finalState, frameId}>` appears in `ExecuteResult` across all SDKs. `session_write` event type streams in `next_event()`. Cross-SDK fixtures verify wire parity.

**Ship criterion:** A Python SDK consumer can find the `"planner"` entry in `result.sessions` and read `entry.finalState["runtime"]["tool_calls"]` after execution. Event stream in Go delivers `SessionWrite` events in order. Fixture tests pass in all 5 SDKs.

### Dependencies
Phase 5 (events) and Phase 4 (final state reachable).

### Files to edit

| # | File | Change | Reference |
|---|---|---|---|
| 1 | `sdk/types.ts` (line 121–131) | Add `sessions: Record<string, unknown>` to `StructuredResult` | `plan-var-session-dossier-sdk-tests.md` §"SDK Extension Walkthrough" |
| 2 | `sdk/types.ts` (line 160–213 area) | Add `SDKSessionWriteEvent` type definition | same |
| 3 | `interpreter/env/Environment.ts` (~line 1896) | Emit SDK event on session write (parallel to state:write emission) | same |
| 4 | `interpreter/execute.ts` (result finalization) | Gather session final states into `result.sessions` before returning | same |
| 5 | `sdk/SPEC.md` | Update Types section (add `sessions` field); update Transport Protocol (add `session_write` event) | same |
| 6 | `sdk/fixtures/execute-result.json` | Add `sessions` object populated with example data | same |
| 7 | `sdk/python/mlld.py` (~line 77–87) | Add `sessions: dict[str, Any]` field to `ExecuteResult`; add `SessionWrite` dataclass; update `_parse_execute_result()` | same |
| 8 | `sdk/go/mlld.go` (~line 129–156) | Add `Sessions map[string]any` to `ExecuteResult` struct; add `SessionWrite` struct; update JSON unmarshaling in event handler | same |
| 9 | `sdk/rust/src/*` | Equivalent `sessions` field + `SessionWrite` struct | same |
| 10 | `sdk/ruby/lib/*` | Equivalent additions | same |
| 11 | `sdk/elixir/lib/*` | Equivalent additions | same |

### Tests

Each SDK gets a wire-format parity test that loads the fixture and deserializes correctly:
- `sdk/python/tests/test_protocol_fixtures.py` — verify `sessions` deserialized
- `sdk/go/mlld_test.go` — verify `Sessions` field populated
- `sdk/rust/tests/protocol_fixtures_test.rs` — verify `sessions`
- (Ruby, Elixir analogs)

Add end-to-end: `sdk/tests/e2e-sessions.test.ts` (or equivalent per language) — run a script that declares a session, exercises writes, verify SDK receives final state in `result.sessions`.

### Checkpoint

- Fixture parity across all SDKs
- Event stream delivers `session_write` events
- `result.sessions` populated with final state
- No SDK drift: all 5 languages updated in same PR

**Estimate: 1–2 days**

---

## Phase 8 — Documentation (this repo)

**Goal:** Document the new primitive in the canonical mlld docs so downstream users (rig, other frameworks) can migrate on their own schedule.

**Ship criterion:** `benchmarks/labels-policies-guards.md` has a complete Sessions section with the access API, guard+session middleware idioms, and worked examples. `sdk/SPEC.md` is cross-checked against Phase 7 additions. Dev-facing docs mention session as a per-call drawer in the bridge frame family.

**Scope note:** This phase is **mlld-repo only**. The rig migration (rewriting `clean/rig/session.mld` to use `var session` and collapsing planner wrappers) is a separate effort in the rig repo, scheduled as a follow-up once Phases 1–7 ship. Keeping that out of this PR avoids a cross-repo migration atomic-PR problem and lets rig upgrade on its own schedule.

### Dependencies
Phases 1–7.

### Files to edit

- `benchmarks/labels-policies-guards.md` — new §"Session State Containers" describing `var session`, the access API (`.set` / `.write` / `.update` / `.append` / `.increment` / `.clear`), snapshot-vs-live distinction, and the guard+session middleware idioms (budget, counter, terminal-latch, execution-log)
- `sdk/SPEC.md` — cross-check Phase 7's additions (`sessions` field, `session_write` event); ensure examples consistent
- `docs/dev/PIPELINE.md` (or equivalent architecture doc) — mention session as the third per-call drawer alongside the handle mint table and proof-claims-registry
- `CLAUDE.md` (project guide) — brief note on where session spec and dossiers live for future agent sessions

### Checkpoint

- Sessions section lands in labels-policies-guards.md with working examples
- SDK SPEC reflects session fields
- Internal architecture doc updated

**Estimate: 0.5–1 day**

---

## Follow-up (separate PR, rig repo)

The rig migration is tracked separately. Kept here as a reference for when the mlld-side work ships:

### Goal
Rewrite `clean/rig/session.mld` to use `var session`, migrate callers in `clean/rig/workers/planner.mld` and `execute.mld`, collapse planner-wrapper boilerplate to `guard + session` idioms, verify known bug classes (m-5683 aliasing, UT14 null-callback family) no longer reproduce.

### Pre-migration audit

Before assuming drop-in reuse, verify rig records used as session slot types are input-style:
- `@plannerRuntime` (as drafted in spec §12) has no `display:` / `when:` → drop-in
- Any other records referenced must be audited; if they carry `display:`, extract an accumulator-only record alongside

### Expected deletion

~300+ lines across `clean/rig/session.mld`, `clean/rig/workers/planner.mld`, `clean/rig/workers/execute.mld`, `clean/rig/tooling.mld` (rough estimate; precise number depends on how much planner-wrapper result-shape coercion stays). The motivation is not LOC — it's elimination of the state-aliasing bug class by construction.

### Rig regression tests

Live in rig's test suite. End-to-end planner flow produces identical output; m-5683 aliasing test no longer reproduces the original failure; UT14 null-callback family no longer triggers.

**Estimate (in rig repo): 2–3 days after mlld-side primitive ships**

---

## Risk Summary

| Risk | Phase | Mitigation |
|---|---|---|
| **Named-accessor resolution subtly wrong** (schema vs live instance, or wrong frame) | Phase 3 | Tag schema-valued positions at AST level; strong typing on declaration identity; strict one-frame lookup (no walking) per spec §3/§5; comprehensive nesting tests |
| **Trace events leak denied-guard writes** | Phases 5+6 | Route all write-method trace emission through `emitOrBufferSessionTrace` (never direct); buffer envelopes with their write entries; commit/discard atomically; dedicated test `deny-drops-trace-event` |
| **Guard write-commit buffering race with retry** | Phase 6 | Discard buffer on retry; test retry-after-allow specifically |
| **Trace redaction leaks sensitive content at effects** | Phase 5 | Dedicated tests with deliberately labeled data; invariant: "never emit content without label check"; manual audit of every emission call site |
| **Cross-SDK drift between Python/Go/Rust/Ruby/Elixir** | Phase 7 | Update all SDKs in single PR; fixture parity test per SDK; `result.sessions` is an array not a map (simpler cross-SDK shape) |
| **Nested session same-name isolation mismatch** | Phase 3 | Spec locked: nearest-frame-only, no walking. Test both attached-inner and unattached-inner cases; verify outer is NEVER reachable from inner |
| **Shelf `validateShelfRecordValue` extraction breaks shelf tests** | Phase 2 | Extract carefully preserving shelf-specific error contexts; run full shelf test suite after extraction |
| **Identity preservation through module import/export** | Phase 1 | Mimic `var tools` follow-up-commit learnings (dedicated export keys); session uses `SessionDeclarationId` (internal, stable) with canonical name for external surfaces |
| **`.update(path, @fn)` with non-pure exe causes re-entrant writes** | Phase 4 | Reject `llm` and tool-dispatching exes at `.update` call time with `MlldSessionUpdateExecutableError`; test `update-llm-exe-rejected` |
| **Bridge activation missing for session-only calls** | Phase 2 | Widen gate to `tools OR session OR shelf scope`; test `session-only-activates-bridge`; verify resume path too |
| **Caller override bypasses wrapper's session invariants** | Phase 2 | Wrapper wins by default; caller override requires explicit `override: "session"`; conflicting `session:` without override raises at `with` merge |

---

## Shipping Order Recommendations

**Option A — linear:** Phases 1–8 in order. ~3 weeks end-to-end. Each phase committable independently.

**Option B — early deletion bonus:** After Phase 4, start a rig-migration spike in parallel with Phases 5–6. Lets rig verify the API surface is right before trace/guard-commit land. Adds ~1 day overhead but reduces risk that Phase 8 surfaces API regret.

**Option C — parallel agents (matches user's workflow):** Dossiers enable highly parallel agent execution:
- Agents 1+2 together: Phases 1+2 (grammar + declaration + bridge attach)
- Agent 3: Phase 3 (named-accessor resolution) — highest risk, dedicated attention
- Agent 4: Phase 4 (write methods)
- Agent 5: Phase 5 (trace + redaction) — after Phase 4
- Agent 6: Phase 6 (guard commit) — after Phases 4+5
- Agent 7: Phase 7 (SDK wire format) — after Phase 5
- Rig migration: Phase 8 — human + agent collaboration

Compresses wall-clock if you're running multiple agents in parallel.

---

## Smallest Useful First Commit

**Phases 1+2 together.** Ships:
- Grammar accepts `var session @name = {...}`
- Schema validation with clear error messages
- Instances materialize on bridge entry with seed writes
- Instances dispose correctly on all exit paths
- Cross-module import/export of schemas

What it does NOT ship: live-instance access (reads fail with `MlldSessionNotAttachedError` since Phase 3 hasn't landed yet; but declaring a session is safe and does nothing at runtime).

This is a valid intermediate landing point: the primitive exists at the language level without external-visible effects. Callers can prepare code for it; reviewers can verify lifecycle correctness in isolation.

---

## Files Created / Modified Summary

### New files
- `core/types/session.ts`
- `core/validation/session-definition.ts`
- `interpreter/eval/var/session-schema.ts`
- `interpreter/session/runtime.ts`
- `interpreter/session/methods.ts`
- `interpreter/session/path.ts`
- `interpreter/session/write-buffer.ts`
- `interpreter/session/frame-lookup.ts` (or folded into `ContextManager`)
- `interpreter/tracing/redact.ts`
- `interpreter/records/validate-fields.ts` (extracted from shelf)
- Tests under `tests/cases/feat/session/*` and `tests/cases/exceptions/session/*`
- `interpreter/eval/session-schema.test.ts`
- `tests/integration/session-lifecycle.test.ts`

### Modified files
- `grammar/patterns/security.peggy`
- `grammar/directives/var.peggy`
- `core/types/var.ts`
- `core/types/record.ts`
- `core/types/trace.ts`
- `interpreter/eval/var.ts`
- `interpreter/eval/var/rhs-dispatcher.ts`
- `interpreter/eval/var/variable-builder.ts`
- `interpreter/eval/exec/scoped-runtime-config.ts`
- `interpreter/eval/exec-invocation.ts`
- `interpreter/eval/exec/builtins.ts`
- `interpreter/env/Environment.ts`
- `interpreter/env/VariableManager.ts`
- `interpreter/env/ContextManager.ts`
- `interpreter/utils/field-access.ts`
- `interpreter/hooks/guard-pre-runtime.ts`
- `interpreter/hooks/guard-pre-hook.ts`
- `interpreter/hooks/guard-decision-reducer.ts`
- `interpreter/shelf/runtime.ts` (extraction only)
- `interpreter/tracing/events.ts`
- `interpreter/eval/import/variable-importer/ModuleExportSerializer.ts`
- `interpreter/eval/import/VariableImporter.ts`
- `sdk/types.ts`
- `sdk/python/mlld.py`
- `sdk/go/mlld.go`
- `sdk/rust/src/*`, `sdk/ruby/lib/*`, `sdk/elixir/lib/*`
- `sdk/SPEC.md`
- `sdk/fixtures/execute-result.json`
- `benchmarks/labels-policies-guards.md`

### External (rig migration)
- `clean/rig/session.mld`
- `clean/rig/workers/planner.mld`
- `clean/rig/workers/execute.mld`

---

## Reference Dossiers

Each phase above cites the relevant dossier. Full detail:
- `plan-var-session-dossier-shelf.md` — template subsystem
- `plan-var-session-dossier-bridge-frame.md` — hosting layer
- `plan-var-session-dossier-mx-lookup.md` — named-accessor resolution
- `plan-var-session-dossier-grammar-archaeology.md` — grammar + var-tools precedent
- `plan-var-session-dossier-guard-dispatch.md` — guard buffering (novel)
- `plan-var-session-dossier-records.md` — slot type classifier
- `plan-var-session-dossier-trace.md` — events + redaction
- `plan-var-session-dossier-sdk-tests.md` — SDK + fixture templates
