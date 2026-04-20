# Dossier: Trace Subsystem + Label-Aware Redaction

**Purpose:** Document the existing trace subsystem so we know what to extend for session events. Session trace redaction is security-critical — a bug here leaks sensitive content.

---

## Executive Summary

The mlld runtime tracing subsystem is a structured event emission framework recording security-relevant and state-relevant effects (shelf writes, guard decisions, policy builds, handle lifecycle, auth checks, display projections, LLM calls, record coercions). Events are collected per-execution, filtered by level (`off`, `effects`, `verbose`, `handle`), and exported to three channels: SDK result field (`result.traceEvents`), stderr stream, and JSONL file sink (`--trace-file`).

**Critical finding: NO existing label-aware redaction in current trace output** — values emitted with minimal summarization (size/key counts), not content filtering. Session trace events specified in spec §11 will require a new redaction utility that filters sensitive/tainted content at `--trace effects` while allowing full content at `--trace verbose`, respecting the policy's `defaults.unlabeled: "untrusted"` setting.

Simpler than feared: `defaults.unlabeled` applied at variable-creation time; by trace emission time, labels are already correct. Redaction just checks `.mx.labels`.

---

## File-and-Line-Range Reference Table

| File | Lines | Purpose |
|------|-------|---------|
| `core/types/trace.ts` | 1–357 | Trace type definitions: `RuntimeTraceEventName` enum (80+ event kinds), `RuntimeTraceEventSpecMap` discriminated union, `RUNTIME_TRACE_LEVELS`, `shouldEmitRuntimeTrace` filter logic |
| `interpreter/tracing/RuntimeTraceManager.ts` | 1–128 | Manager class: `configure()`, `emitTrace()`, `getLevel()`, shelf tracker integration |
| `interpreter/tracing/events.ts` | 1–214 | Helper factories: `traceShelfWrite()`, `traceGuardEvent()`, `tracePolicyEvent()`, `traceAuthDecision()` |
| `interpreter/tracing/RuntimeTraceValue.ts` | 1–93 | `summarizeRuntimeTraceValue()`: string preview (160 char limit), array/object size summaries |
| `interpreter/tracing/RuntimeTraceFormatter.ts` | 1–39 | `formatRuntimeTraceLine()`: stderr line formatter |
| `interpreter/env/Environment.ts` | ~1500+ | `emitRuntimeTraceEvent()`, `recordShelfWrite()`, `issueHandle()`, `resolveHandle()`: all trace emission call sites |
| `core/policy/input-taint.ts` | 1–63 | `resolveInputTaint()`: applies `defaults.unlabeled` label to unlabeled values **at variable-creation time** |
| `spec-runtime-effect-tracing.md` | 1–173 | Runtime tracing spec: trace categories, output channels, levels |

---

## Event Taxonomy Table

| Event Name | Category | Payload Shape | Emission Site | Purpose |
|---|---|---|---|---|
| `shelf.write` | shelf | `{slot, action, success, value}` | `Environment.writeShelfSlot()` (~ln 710) | Record state write to slot |
| `shelf.read` | shelf | `{slot, found, value?}` | `Environment.readShelfSlot()` (~ln 680) | Read from slot (verbose only) |
| `shelf.clear` | shelf | `{slot, action, success}` | `Environment.clearShelfSlot()` (~ln 740) | Slot clear/reset |
| `shelf.stale_read` | shelf | `{slot, writeTs, readTs, expected, actual, message}` | `emitStaleShelfRead()` | Write-then-stale-read detection |
| `guard.evaluate` | guard | `{phase, guard, operation, scope, attempt?, inputPreview?}` | `interpreter/hooks/guard-*.ts` | Guard evaluation entered |
| `guard.allow` / `guard.deny` / `guard.retry` / `guard.resume` | guard | `{... evaluate fields ..., decision, reasons, hints}` | `guard-pre-hook.ts`, `guard-post-orchestrator.ts` | Guard decisions |
| `handle.issued` | handle | `{handle, valuePreview?, factsourceRef?, sessionId?}` | `Environment.issueHandle()` (~ln 2050) | Display projection / builder mint |
| `handle.resolved` | handle | `{handle, valuePreview?, sessionId?}` | `Environment.resolveHandle()` (~ln 2080) | Handle lookup in bridge mint table |
| `handle.resolve_failed` | handle | `{handle, reason?, sessionId?}` | `Environment.resolveHandle()` (~ln 2090) | Handle not found |
| `handle.released` | handle | `{sessionId, handleCount}` | `call-mcp-config.ts` (~ln 490) | Handles released at call exit |
| `policy.build` | policy | `{mode, toolCount, valid, issueCount, repairedArgCount, droppedEntryCount, droppedArrayElementCount}` | `interpreter/env/builtins/policy.ts` (~ln 1250) | Policy builder compiled intent |
| `policy.validate` | policy | `{... build fields ...}` | `policy.ts` (~ln 1260) | Policy validator ran |
| `policy.compile_drop` | policy | `{mode, droppedEntries, droppedArrayElements}` | `policy.ts` (~ln 1280) | Policy builder dropped entries |
| `auth.check` / `auth.allow` / `auth.deny` | auth | `{tool, args?}` | `authorization-trace.ts` | Authorization check path |
| `display.project` | display | `{record, field, mode, handleIssued?, handleCount?, elementCount?}` | `display-projection.ts` (~ln 380) | Record field projected to LLM |
| `llm.call` | llm | `{phase: 'finish', sessionId?, provider?, model?, toolCount?, resume, ok, error?, durationMs?}` | `exec-invocation.ts` (~ln 520) | LLM call completed |
| `llm.resume` / `llm.tool_call` / `llm.tool_result` | llm | various | `exec-invocation.ts` | LLM lifecycle |
| `record.coerce` / `record.schema_fail` | record | `{record, field, shelf, expected, value?}` | `interpreter/shelf/runtime.ts` | Record field coerced / validation failed |
| `import.resolve` / `import.cache_hit` / `import.read` / `import.parse` / `import.evaluate` / `import.exports` / `import.fail` | import | `{ref, resolvedPath?, transport?, importType?, ...}` | `import/runtime-trace.ts` | Import lifecycle |

**Not yet defined:** `session.seed`, `session.write`, `session.final` (to be added).

---

## Redaction Precedent Verdict

**Explicit verdict: NO label-aware filtering exists in current trace output.**

Current behavior: `RuntimeTraceValue.summarizeRuntimeTraceValue()` truncates strings to 160 chars and summarizes objects/arrays as `{kind, keys[], size, bytes, human}`. **No inspection of `.mx.labels` or `.mx.taint` occurs.** The `value` field in `shelf.write`, `auth.check`, etc. receives full summarized (but unredacted) value.

**Closest precedent for bounded formatting:** The value summarizer implements size-capped output. Architectural pattern to extend: add a redaction stage *before* summarization that checks labels.

**Policy integration:** `defaults.unlabeled: "untrusted"` applied at variable-creation time via `resolveInputTaint()` in `core/policy/input-taint.ts`. By the time trace sees the value, unlabeled values **already carry `untrusted`** if policy set that default. Redaction logic filtering on `untrusted` automatically respects this — no explicit policy consultation needed at emit time.

---

## Key Code Excerpts

### 1. Core Event Emission Pattern

`interpreter/env/Environment.ts`

```typescript
writeShelfSlot(shelfName: string, slotName: string, value: unknown, options: {...}): void {
  owner.ensureShelfStateBucket(shelfName).set(slotName, value);
  
  const slotRef = `@${shelfName}.${slotName}`;
  const traceEnv = options.traceEnv ?? this;
  const traceScope = traceEnv.buildRuntimeTraceScope(options.traceScope);
  traceEnv.runtimeTraceManager.recordShelfWrite(slotRef, value, traceScope);
  
  traceEnv.emitRuntimeTraceEvent(traceShelfWrite({
    slot: slotRef,
    action: options.action ?? 'write',
    success: true,
    value: traceEnv.summarizeTraceValue(value),  // summarize but do NOT redact
    event: options.traceEvent,
    traceData: options.traceData
  }), traceScope);
}
```

### 2. Level Branching Logic

`core/types/trace.ts`

```typescript
export function shouldEmitRuntimeTrace(
  current: RuntimeTraceLevel,
  required: RuntimeTraceEmissionLevel,
  category: RuntimeTraceCategory
): boolean {
  const normalized = normalizeRuntimeTraceLevel(current);
  if (normalized === 'off') return false;
  if (normalized === 'verbose') return true;
  if (normalized === 'handle') return category === 'handle';
  return required === 'effects';
}
```

### 3. SDK Event Stream Export

`sdk/types.ts`

```typescript
export interface StructuredResult {
  output: string;
  effects: StructuredEffect[];
  exports: ExportMap;
  stateWrites: StateWrite[];
  denials: SDKGuardDenial[];
  traceEvents: RuntimeTraceEvent[];   // Trace events live here
  metrics?: ExecuteMetrics;
  environment?: Environment;
  streaming?: StreamingResult;
}
```

SDK consumers call `client.execute(script, trace="effects")` and receive `result.traceEvents` as array of `RuntimeTraceEvent` objects. Session events will add to this array automatically.

### 4. `defaults.unlabeled` Application

`core/policy/input-taint.ts`

```typescript
export function resolveInputTaint(
  inputTaint: readonly string[] | undefined,
  policy?: PolicyConfig
): ResolvedInputTaint {
  const raw = normalizeList(inputTaint);
  const isUnlabeled = raw.length > 0 && !hasUserLabels(raw, policy);
  
  const applyUntrustedDefault =
    policy?.defaults?.unlabeled === 'untrusted' && isUnlabeled;
  const effective = applyUntrustedDefault && !raw.includes('untrusted')
    ? [...raw, 'untrusted']
    : raw;
  
  return { raw, effective, isUnlabeled, applyUntrustedDefault };
}
```

**Implication:** By trace emission time, if `defaults.unlabeled: "untrusted"` is set, unlabeled values **already carry `untrusted`**. Redaction filtering on `untrusted` / `secret` / `pii` / `influenced` automatically catches them without re-consulting policy config.

### 5. Value Summarizer (No Redaction Today)

`interpreter/tracing/RuntimeTraceValue.ts`

```typescript
export function summarizeRuntimeTraceValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > TRACE_STRING_PREVIEW_LIMIT
      ? `${value.slice(0, TRACE_STRING_PREVIEW_LIMIT - 3)}...`
      : value;
  }
  
  if (Array.isArray(value)) {
    return withRuntimeTraceSize({
      kind: 'array',
      length: value.length
    }, value);
  }
  
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return withRuntimeTraceSize({
      kind: 'object',
      keys: keys.slice(0, 8),
      size: keys.length
    }, value);
  }
  // ... primitives pass through
}
```

**Extension point:** Redaction utility must run *before* this and decide whether to return placeholder (e.g., `{labels: [list], size: N}`) or pass through unchanged.

### 6. Trace Event Helper Factory

`interpreter/tracing/events.ts`

```typescript
export function traceShelfWrite(data: {
  slot: string;
  action?: string;
  success?: boolean;
  value: unknown;
  event?: 'shelf.write' | 'shelf.remove';
  traceData?: Record<string, unknown>;
}): RuntimeTraceEnvelope<'shelf.write'> | RuntimeTraceEnvelope<'shelf.remove'> {
  const {event = 'shelf.write', action = 'write', success = true, traceData, ...rest} = data;
  return createRuntimeTraceEnvelope('effects', 'shelf', event, {
    ...rest, action, success,
    ...(traceData ?? {})
  });
}
```

No label awareness here. Value passed through to envelope unfiltered. Redaction must happen at call site before passing `value` to this helper.

---

## Extension Points

### New Event Types

**File:** `core/types/trace.ts`

Add to `RuntimeTraceEventName` enum:
- `'session.seed'`
- `'session.write'`
- `'session.final'`

Add payload specs to `RuntimeTraceEventSpecMap`:
```typescript
'session.seed': {
  level: 'effects';
  category: 'session';
  data: {
    session_name: string;
    slot_path: string;
    value: unknown;  // redacted
  };
};
'session.write': {
  level: 'effects';
  category: 'session';
  data: {
    session_name: string;
    slot_path: string;
    prev: unknown;   // redacted
    next: unknown;   // redacted
    frame_id: string;
    operation: 'set' | 'write' | 'update' | 'append' | 'increment' | 'clear';
  };
};
'session.final': {
  level: 'effects';
  category: 'session';
  data: {
    session_name: string;
    final_state: Record<string, unknown>;  // redacted
    frame_id: string;
  };
};
```

### New Event Factories

**File:** `interpreter/tracing/events.ts`

Three new functions:
- `traceSessionSeed()`
- `traceSessionWrite()`
- `traceSessionFinal()`

### Redaction Utility (New File)

**File:** `interpreter/tracing/redact.ts` (new)

```typescript
export function redactTraceValueForLevel(
  value: unknown,
  level: RuntimeTraceNormalizedLevel,
  policy?: PolicyConfig
): unknown {
  if (level === 'verbose') {
    return value;  // Full content at verbose
  }
  
  if (level === 'effects') {
    const descriptor = extractSecurityDescriptor(value);
    
    // Show unlabeled + trusted labels in full
    if (!hasRestrictiveLabels(descriptor)) {
      return summarizeRuntimeTraceValue(value);
    }
    
    // Redact: show placeholder
    const labelList = descriptor.labels.filter(
      l => l !== 'trusted' && !l.startsWith('src:')
    );
    const size = estimateRuntimeTraceValueBytes(value);
    return {
      labels: labelList,
      size: size ? formatRuntimeTraceSize(size) : 'N/A'
    };
  }
  
  return summarizeRuntimeTraceValue(value);
}
```

### Call Site Integration

At each session emission site (new `interpreter/session/runtime.ts` or similar):

```typescript
const redactedValue = redactTraceValueForLevel(value, traceEnv.getLevel(), policy);
traceEnv.emitRuntimeTraceEvent(traceSessionWrite({
  session_name: schemaName,
  slot_path: path,
  prev: redactedPrev,
  next: redactedNext,
  frame_id: frameId,
  operation: 'set'
}), scope);
```

### Emit Points

- **Seed events:** `interpreter/session/runtime.ts` — at session instance creation, loop over seed fields, emit `traceSessionSeed`
- **Write events:** on each `.set()`, `.write()`, `.append()`, etc., emit `traceSessionWrite` with redacted prev/next
- **Final events:** at call teardown, emit `traceSessionFinal` with redacted snapshot

---

## Flags & Non-Obvious Interactions

1. **Trace level and SDK streaming are orthogonal.** SDK streaming (event-by-event) is controlled separately from `--trace`. Both can be active simultaneously: session trace events appear in both channels automatically.

2. **Redaction respects `defaults.unlabeled` without explicit consultation.** Policy auto-applies `untrusted` to unlabeled values before emission. Redaction filtering on `untrusted` catches them. **Implication:** Scripts with `defaults.unlabeled: "untrusted"` will have all unlabeled values redacted at `--trace effects` automatically, even without explicit `var untrusted @x` declarations.

3. **`verbose` level is a security footgun.** `--trace verbose` prints full content of all values, including `secret` and `untrusted`, to stderr and files. Opt-in; should carry warning banner. Spec §11: "This mode is opt-in and intended for debugging sessions with synthetic or non-sensitive data."

4. **Snapshot policy on guard denial.** Spec §11 mentions snapshot on denial. Display-time decision: if guard denies, emit `session.final` with current state before denial takes effect. Requires hook integration at denial sites. **Redaction of snapshot follows same rules as regular `session.write`.**

5. **Handle disclosure in trace.** Handle strings (`h_xyz`) are opaque, carry no content. Can appear unredacted in `handle.issued`, `handle.resolved`, `auth.check` payloads. The value *behind* the handle is what's redacted when that value appears in `session.write`.

6. **Size caps independent of redaction.** Existing size cap mechanism applied *after* redaction. A redacted value `{labels: [...], size: "42 KB"}` still respects size thresholds. Correct: redaction replaces content with smaller summary.

7. **Event enumeration via grep.** Session event names not in `RuntimeTraceEventName` enum yet. Implementation: three entries to union, three factories to `events.ts`, three payload specs to `RuntimeTraceEventSpecMap`, test fixtures.

---

## Non-Goals Confirmation

- **Did NOT design session trace events.** Documents existing trace machinery. Session event design in session spec §11.
- **Did NOT design label-aware filtering.** Spec §11 defines redaction rules (content hidden at `effects`, shown at `verbose`, placeholders with label/size). This doc identifies extension point.
- **Did NOT audit for existing label leaks.** Gap-identification exercise, not rewrite. Future work: run trace with `defaults.unlabeled: "untrusted"` and verify no `secret` values appear unredacted at `--trace effects`.

---

## Summary for Implementation

| Task | File | Pattern |
|------|------|---------|
| Add event types | `core/types/trace.ts` | Add session events to enum + specs |
| Add event factories | `interpreter/tracing/events.ts` | Three new functions |
| Add redaction utility | `interpreter/tracing/redact.ts` (new) | Label-filter + fallback to summarizer |
| Emit seed events | `interpreter/session/runtime.ts` (new) | At instance creation, loop seed fields |
| Emit write events | `interpreter/session/runtime.ts` | At each method call, redact prev/next |
| Emit final events | `interpreter/session/runtime.ts` | At call teardown, redacted snapshot |
| Call redaction | All emitters | Before passing to trace helpers |
| Test fixtures | `tests/cases/feat/session/` | Redaction at `effects` vs `verbose` |

~1-2 days of focused work given existing infrastructure.
