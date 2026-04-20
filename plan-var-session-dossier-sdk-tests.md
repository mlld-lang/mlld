# Dossier: SDK Wire Format + Test Infrastructure

**Purpose:** Document how new fields are added to `ExecuteResult` and new event types to the stream. Map the spec's 10 test scenarios to existing fixture templates.

---

## Executive Summary

The mlld SDK wire format uses an additive event-stream model: `ExecuteResult` (defined in `sdk/types.ts`) aggregates execution outputs including `stateWrites`, `denials`, and `traceEvents`; new per-call events (like `state:write` and `guard_denial`) emit via `SDKEvent` types and collect into the final result. Adding `sessions: {[name]: finalState}` and a new `session_write` event type follows this pattern exactly.

Test infrastructure uses fixture-directory pattern (`tests/cases/` → `tests/fixtures/*.generated-fixture.json`) with three-file structure (`.md` example, expected output, error pattern for exceptions). Complex tests (guards, security, concurrency) already exist; session tests need ~10 scenarios covering basic I/O, seeding, nesting, concurrency, resume, type validation, guard integration, write-commit-on-deny, override rejection, atomic helpers.

**No cross-SDK code generation exists** — Python, Go, Rust, Ruby, Elixir hand-maintain their `ExecuteResult` dataclass/struct; adding `sessions` requires updates to each language's type definitions.

---

## File-and-Line-Range Reference Table

### SDK Wire Format (TypeScript/JavaScript)

| File | Lines | Purpose |
|------|-------|---------|
| `sdk/types.ts` | 24–131 | `ExecuteResult`, `StructuredResult` interface; fields: `output`, `exports`, `stateWrites`, `denials`, `traceEvents`, `metrics` |
| `sdk/types.ts` | 160–213 | Event types: `SDKEffectEvent`, `SDKStateWriteEvent` (203–207), `SDKGuardDenialEvent` (209–213) |
| `sdk/execute.ts` | 32–55 | `ExecuteOptions` interface (payload, state, timeout, trace options) |
| `interpreter/env/Environment.ts` | 1886–1906 | State write emission: `emitSDKEvent()` call with `type: 'state:write'` payload |
| `interpreter/eval/guard-denial-events.ts` | 91–106 | `buildGuardDenial()` → `SDKGuardDenial` struct builder |
| `sdk/SPEC.md` | 462–473 | `ExecuteResult` type spec: all fields documented |
| `sdk/SPEC.md` | 71–88 | Transport protocol envelope shape: `{ "id": <int>, "result": <payload> }` |

### Language SDK Type Definitions

| File | Lines | Purpose |
|------|-------|---------|
| `sdk/python/mlld.py` | 77–87 | Python `ExecuteResult` dataclass |
| `sdk/python/mlld.py` | 53–61 | Python `GuardDenial` dataclass |
| `sdk/go/mlld.go` | 129–156 | Go wrapper functions for `Execute`, `ExecuteAsync`; options struct |
| `sdk/SPEC.md` | 403–458 | Label helpers (Python, Go, Rust, Ruby, Elixir examples) |

### Test Infrastructure & Fixtures

| File | Lines | Purpose |
|------|-------|---------|
| `CLAUDE.md` | 56–65 | Test structure: `tests/cases/` layout, fixture generation, naming conventions |
| `scripts/fixture-test-runner.js` | 1–100 | Test runner matching fixture patterns via `npm run test:case` |
| `scripts/build-fixtures.mjs` | 1–100 | Fixture builder: walks `tests/cases/`, generates `.generated-fixture.json` |
| `tests/cases/feat/security/guard-allow/` | — | Example guard test: `example.md` (input), `expected.md` (output) |
| `tests/cases/exceptions/alligator/section-selector-invalid-exclude-delimiter/` | — | Example error test: `example.md`, `error.md` |

---

## SDK Extension Walkthrough

### Adding `sessions` to `ExecuteResult` (TypeScript)

**Step 1:** Update `ExecuteResult` type (`sdk/types.ts`)

```typescript
// Line 121–131, add to StructuredResult interface:
export interface StructuredResult {
  output: string;
  effects: StructuredEffect[];
  exports: ExportMap;
  stateWrites: StateWrite[];
  denials: SDKGuardDenial[];
  traceEvents: RuntimeTraceEvent[];
  sessions: Record<string, unknown>;  // NEW: { sessionName: finalState }
  metrics?: ExecuteMetrics;
  environment?: Environment;
  streaming?: StreamingResult;
}
```

**Step 2:** Update SDK SPEC (`sdk/SPEC.md`, Types section)

```markdown
### ExecuteResult

| Field | Type | Description |
|-------|------|-------------|
| ... existing fields ...     |
| sessions | Record<string, unknown> | Per-call session final states (new in v1.x) |
```

**Step 3:** Update transport fixture (`sdk/fixtures/execute-result.json`)

Add `sessions: { "planner": { "agent": {...}, "runtime": {...} } }` to fixture JSON.

**Step 4:** Update Python SDK (`sdk/python/mlld.py`)

```python
@dataclass
class ExecuteResult:
    """Structured output from execute()."""
    output: str
    state_writes: list[StateWrite] = field(default_factory=list)
    exports: Any = field(default_factory=list)
    effects: list[Effect] = field(default_factory=list)
    denials: list[GuardDenial] = field(default_factory=list)
    trace_events: list[TraceEvent] = field(default_factory=list)
    sessions: dict[str, Any] = field(default_factory=dict)  # NEW
    metrics: Metrics | None = None
```

Update deserialization in `Client._parse_execute_result()`:
```python
result.sessions = data.get('sessions', {})
```

**Step 5:** Update Go SDK (`sdk/go/mlld.go`)

```go
type ExecuteResult struct {
    // ... existing fields ...
    Sessions map[string]any `json:"sessions"`  // NEW
}
```

**Step 6:** Update Rust, Ruby, Elixir SDKs similarly (hand-maintained structs).

### Adding `session_write` Event Type

**Step 1:** Define event type (`sdk/types.ts`)

```typescript
export type SDKSessionWriteEvent = {
  type: 'session_write';
  session_write: {
    session_name: string;      // e.g. "planner"
    slot_path: string;         // e.g. "runtime.tool_calls"
    prev: unknown;
    next: unknown;
    frame_id: string;
    timestamp: number;
  };
};
```

**Step 2:** Emit from runtime (`interpreter/env/Environment.ts`, near line 1896)

```typescript
if (root.hasSDKEmitter()) {
  root.emitSDKEvent({
    type: 'session_write',
    session_write: {
      session_name: entry.sessionName,
      slot_path: entry.slotPath,
      prev: entry.prev,
      next: entry.next,
      frame_id: entry.frameId,
      timestamp: Date.now()
    }
  } as SDKEvent);
}
```

**Step 3:** Add to transport event types (`sdk/SPEC.md`, Transport Protocol section)

```markdown
Event types on the wire:
- `state:write` - a state:// write occurred
- `guard_denial` - a guard/policy denied an operation
- `session_write` - NEW: a session slot was written
- `result` - execution completed
```

**Step 4:** Update Python SDK (`sdk/python/mlld.py`)

```python
@dataclass
class SessionWrite:
    """Represents a session slot write."""
    session_name: str
    slot_path: str
    prev: Any
    next: Any
    frame_id: str | None = None
    timestamp: str | None = None
```

Update handle's `next_event()` parsing to recognize `session_write`.

**Step 5:** Update Go, Rust, Ruby, Elixir SDKs (add `SessionWrite` struct/record + parsing).

---

## Test-Fixture Catalog

Per spec §15 item 11, ~10 test scenarios required. Mapping to existing templates:

| Scenario | Closest Existing Template | Template Reason | Path |
|----------|--------------------------|-----------------|------|
| **1. Basic read/write** | `tests/cases/feat/var-block/` | Variable assignment & access pattern | `tests/cases/feat/var-block/` |
| **2. Seed at call start** | `tests/cases/feat/module-system/directive-guard/` | Multi-file import setup with state initialization | `tests/cases/feat/module-system/directive-guard/` |
| **3. Nesting (inner only)** | `tests/cases/feat/security/guard-allow/` | Guard dispatch during nested execution | `tests/cases/feat/security/guard-allow/` |
| **4. Nesting (same-name multi-level)** | *No direct template* | Would need new fixture: nested `@claude()` calls with same session name | `tests/cases/feat/session/nesting-same-name/` |
| **5. Concurrency isolation (parallel fan-out)** | `tests/cases/feat/for-block/` | Parallel pipeline stages; adapt for concurrent `@claude()` calls | `tests/cases/feat/for-block/` |
| **6. Resume isolation** | `tests/cases/interpreter/checkpoint/integration-fixtures.test.ts` | Checkpoint/resume frame lifecycle; sessions die on resume | `tests/interpreter/checkpoint/` |
| **7. Type validation error** | `tests/cases/exceptions/augmented-assignment-type-mismatch/` | Type mismatch error pattern | `tests/cases/exceptions/augmented-assignment-type-mismatch/` |
| **8. Guard integration (budget, counter, log)** | `tests/cases/feat/security/guard-after-transform/` | Guard body executing .write() calls on ambient state | `tests/cases/feat/security/guard-after-transform/` |
| **9. Write-commit on deny** | `tests/cases/feat/security/guard-deny-handled/` | Before-guard denial rolls back writes | `tests/cases/feat/security/guard-deny-handled/` |
| **10. Override rejection** | *No direct template* | `with { session: @alt, override: "session" }` required | `tests/cases/feat/session/override-rejection/` |
| **11. Trace redaction** | `tests/cases/security/var-expression-descriptor-preserved/` | Label flow & trace events | `tests/cases/security/var-expression-descriptor-preserved/` |
| **12. Atomic helpers** | *No direct template* | `.increment()`, `.append()`, `.update()` | `tests/cases/feat/session/atomic-helpers/` |

**Flagged gaps:** Scenarios 4, 5, 10, 12 require new fixtures. Not critical to design, but test generation should create templates.

---

## Key Code Excerpts

### 1. ExecuteResult Type Definition

`sdk/types.ts:121–131`

```typescript
export interface StructuredResult {
  output: string;
  effects: StructuredEffect[];
  exports: ExportMap;
  stateWrites: StateWrite[];
  denials: SDKGuardDenial[];
  traceEvents: RuntimeTraceEvent[];
  metrics?: ExecuteMetrics;
  environment?: Environment;
  streaming?: StreamingResult;
  // ADD: sessions: Record<string, unknown>;
}
```

### 2. Event Types

`sdk/types.ts:203–213`

```typescript
export type SDKStateWriteEvent = {
  type: 'state:write';
  write: StateWrite;
  timestamp: number;
};

export type SDKGuardDenialEvent = {
  type: 'guard_denial';
  guard_denial: SDKGuardDenial;
  timestamp: number;
};

// ADD SESSION_WRITE similarly
```

### 3. State Write Emission (Runtime)

`interpreter/env/Environment.ts:1886–1906`

```typescript
root.stateWrites.push(entry);
root.applyStateWriteToSnapshot(entry);

if (root.hasSDKEmitter()) {
  root.emitSDKEvent({
    type: 'state:write',
    write: entry,
    timestamp: Date.now()
  } as SDKEvent);
}
```

**Pattern to follow for session writes:** same structure, new event type `'session_write'`.

### 4. Guard Denial Extraction

`interpreter/eval/guard-denial-events.ts:91–106`

```typescript
function buildGuardDenial(
  reason: string,
  denialContext?: DenialContext,
  guardContext?: GuardContextSnapshot,
  details?: GuardErrorDetails
): SDKGuardDenial {
  const isPolicyDenial = denialContext?.blocker.type === 'policy';
  return {
    guard: isPolicyDenial ? null : stripPrefix(details?.guardName ?? null),
    operation: deriveOperationName(details?.operation, denialContext),
    reason,
    rule: isPolicyDenial ? normalizeRule(denialContext?.blocker.rule) : null,
    labels: collectLabels(denialContext, guardContext),
    args: extractArgs(guardContext?.args)
  };
}
```

**Pattern:** Structured event builder that normalizes and validates fields before serialization.

### 5. Python SDK ExecuteResult

`sdk/python/mlld.py:77–87`

```python
@dataclass
class ExecuteResult:
    output: str
    state_writes: list[StateWrite] = field(default_factory=list)
    exports: Any = field(default_factory=list)
    effects: list[Effect] = field(default_factory=list)
    denials: list[GuardDenial] = field(default_factory=list)
    trace_events: list[TraceEvent] = field(default_factory=list)
    metrics: Metrics | None = None

# ADD: sessions: dict[str, Any] = field(default_factory=dict)
```

### 6. Test Fixture Structure

`tests/cases/feat/security/guard-allow/example.md`:

```markdown
/guard @secretShowBlock for secret = when [
  @mx.op.type == "show" => deny "Secrets cannot be shown"
  * => allow
]

/var @publicMessage = "Hello, world!"
/show @publicMessage
```

`tests/cases/feat/security/guard-allow/expected.md`:
```markdown
# Guard Allow

Hello, world!
```

### 7. Error Test Structure

`tests/cases/exceptions/augmented-assignment-type-mismatch/example.md`:
```markdown
/var @x = 5
/var @x += "string"
```

`tests/cases/exceptions/augmented-assignment-type-mismatch/error.md`:
```
Type mismatch: cannot add string to number
```

---

## Extension Points

### Wire Format Addition

1. **Result shape:** `sdk/types.ts` line 121–131 → add `sessions` field
2. **Event type:** `sdk/types.ts` line 160–280 → add `SDKSessionWriteEvent`
3. **Spec:** `sdk/SPEC.md` → update Types and Transport Protocol sections
4. **Transport fixtures:** `sdk/fixtures/execute-result.json` → add `sessions` object

### Runtime Emission

1. **Session write emission:** `interpreter/env/Environment.ts` (new method or extend `writeStateSlot` analog)
2. **Trace events:** `interpreter/tracing/events.ts` (add `traceSessionWrite()`)
3. **Result finalization:** wherever `ExecuteResult` is built — merge session snapshots

### SDK Updates (Hand-Maintained)

1. **Python:** `sdk/python/mlld.py`
   - Add `SessionWrite` dataclass (~line 65)
   - Add `sessions` field to `ExecuteResult` (~line 87)
   - Update `Client._parse_execute_result()` to deserialize `sessions`

2. **Go:** `sdk/go/mlld.go`
   - Add `SessionWrite` struct
   - Add `Sessions` field to `ExecuteResult`
   - Update JSON unmarshaling in event handler

3. **Rust, Ruby, Elixir:** Similar struct/record definitions

### Test Infrastructure

1. **Fixture templates:** Create `tests/cases/feat/session/` directory with subdirs for each scenario
2. **Fixture builder:** No code changes needed; auto-picks up new dirs
3. **Test runner:** No changes; existing `fixture-test-runner.js` handles `npm run test:case -- feat/session/*`

---

## Flags: Wire-Format Versioning Hazards

### Hazard 1: Missing `sessions` in Old Transport Responses

If old runtime (pre-sessions) called via SDK, response lacks `sessions`. SDKs must default to `{}`.

**Mitigation:** All language SDKs initialize `sessions: {}` if missing:
```python
result.sessions = data.get('sessions', {})
```

### Hazard 2: Cross-SDK Type Drift

Python adds `sessions` but Go SDK updated months later; parallel calls see different shapes.

**Mitigation:**
- Update **all SDKs in single PR** (Python, Go, Rust, Ruby, Elixir)
- Add parity fixture in `sdk/fixtures/execute-result.json` with sessions populated
- Each SDK test must verify fixture deserialization (already done via `test_protocol_fixtures.py`, `protocol_fixtures_test.go`)

### Hazard 3: Session Redaction Rules Not Synchronized

Runtime redacts at `--trace effects`, but SDK consumer only reads final `sessions` snapshot.

**Mitigation:**
- Session writes emit via `session_write` event stream (same as `state:write`, subject to same redaction)
- Final `sessions` snapshot is post-execution; redaction at event time sufficient
- No new redaction logic needed; reuse existing `stateWrites` redaction

### Hazard 4: Named-Accessor Frame Resolution in Nested Calls

Outer `@claude()` with `session: @planner`, inner with same — inner should shadow outer.

**Mitigation:**
- Interpreter already implements frame-scoped lookup for `@mx.op`
- Session resolution reuses same machinery
- **Requires test** `tests/cases/feat/session/nesting-same-name/` to verify

### Hazard 5: Atomic Helpers Forward-Compatibility

Spec allows `.update(path, fn)`, `.increment()`, `.append()`. If runtime parallelizes tool dispatch (not in v1, flagged in spec), atomicity must hold.

**Mitigation:**
- v1: single-threaded tool dispatch; atomic helpers are semantic-only
- No extra machinery needed; serialized per frame
- Spec rationale already documented (§6, forward-compatibility note)

### Hazard 6: Session vs. Var Immutability Boundary

Session is mutable, vars are immutable. Test might expect `var @sess = @planner` to create immutable binding, then `@planner.set()` fails.

**Mitigation:**
- Session accessor (`@planner`) is **not a var** — context-dependent resolution
- Tests must verify: `var @sess = @planner` (reads current value, immutable binding) vs. `@planner.set()` (mutates live session)
- Spec §6 explicitly states "Session is not a var"; test coverage recommended

---

## Non-Goals Confirmation

- ✓ Did not design session SDK shape (specified in spec §11–12)
- ✓ Did not design tests (spec §15 item 11 lists scenarios; fixture generation templated)
- ✓ Did not hand-code SDKs (specifies where Python, Go, Rust, Ruby, Elixir change but doesn't implement — SDK-maintainer work)
- ✓ Did not change interpreter core (session runtime lives in bridge-layer frame lifecycle; only new event emission and frame-scoped storage)

---

## Summary for Implementation

**Minimum changes to hit "few hours" bar:**

| Task | Time Estimate |
|---|---|
| TypeScript: Add `sessions` to `StructuredResult` + `SDKSessionWriteEvent` | 1 hour |
| Python: Add `sessions` field + deserialization | 30 min |
| Go: Add `Sessions map[string]any` + JSON tag | 30 min |
| Rust/Ruby/Elixir: Equivalent struct updates (parallelizable) | 30 min each |
| Test fixtures: 10 scenarios in `tests/cases/feat/session/` | 1-2 hours |
| Spec + docs: Update `sdk/SPEC.md` + add fixture to `sdk/fixtures/` | 30 min |

**Total: ~4 hours** (dominated by fixture creation and cross-SDK verification).
