# Dossier: Shelf Implementation (Template for `var session`)

**Purpose:** Document how `shelf @name = {...}` works end-to-end so the `var session` implementation can be designed by analogy. Shelves are cousin-of-session: same typed-slot shape, different lifetime (execution vs per-LLM-call).

---

## Executive Summary

The shelf subsystem is mlld's persistent, execution-wide mutable state container. It comprises:
1. A grammar layer parsing `/shelf @name = {...}` directives into slot definitions
2. An Environment-managed storage layer (`shelfState` Map keyed by shelf → slot name → value) persistent for the script execution lifetime
3. A runtime validation layer (`validateShelfRecordValue`) that coerces incoming values to declared record types before storage
4. A field-access layer that materializes `ShelfSlotRefValue` capability objects exposing both live content (`.data`, `.text`) and identity (`.shelfName`, `.slotName`)
5. Builtin dispatch functions (`@shelf.read`, `@shelf.write`, `@shelf.clear`) that mediate all slot I/O
6. Scope enforcement via `box.shelf { read: [...], write: [...] }` that creates a `NormalizedShelfScope` describing readable/writable slots
7. Module boundaries that serialize/deserialize shelf definitions via `SerializedShelfDefinition` carriers

Key architectural point: shelves are **declaratively defined, globally registered, and per-execution-lifetime** — unlike the proposed session primitive, which is per-LLM-call, tied to bridge frames, and newly materialized for each invocation.

---

## File-and-Line-Range Reference Table

| File | Line Range | Purpose |
|------|-----------|---------|
| `grammar/directives/shelf.peggy` | 1–144 | Parse `/shelf @name = {...}` syntax; emit DirectiveNode with slot metadata; validate slot name uniqueness |
| `core/types/shelf.ts` | 1–227 | Define `ShelfDefinition`, `ShelfSlotRefValue` class, `NormalizedShelfScope`, serialization markers (`__mlldShelfScope`, `SHELF_SLOT_REF_VALUE_SYMBOL`) |
| `interpreter/shelf/runtime.ts` | 1–100 | Utility helpers: `cloneStructuredValue`, `preserveStructuredScalarValue`, `buildSlotSourceDescriptor`, record projection metadata builders |
| `interpreter/shelf/runtime.ts` | 172–226 | Record field evaluation in shelf context: extract nested slot ref values, handle template interpolation, preserve wrapper metadata |
| `interpreter/shelf/runtime.ts` | 315–391 | `coerceFieldValue`: normalize scalar/array/object/handle types for slot validation; preserve wrappers on scalars |
| `interpreter/shelf/runtime.ts` | 501–600 | **`validateShelfRecordValue`**: core slot type validation (REUSABLE for session) |
| `interpreter/shelf/runtime.ts` | 989–1075 | **`writeToShelfSlot`**: extract slot ref, validate record, merge collection items, write to Environment storage, emit trace events |
| `interpreter/shelf/runtime.ts` | 1077–1097 | **`readShelfSlot`**: extract slot ref, return current value via `createShelfSlotReferenceValue` |
| `interpreter/shelf/runtime.ts` | 1099–1121 | **`clearShelfSlot`**: extract slot ref, delete from Environment, emit trace events |
| `interpreter/shelf/runtime.ts` | 1394–1471 | `createShelfBuiltinVariable` / `createShelveVariable`: register `@shelf` / `@shelve` namespaces |
| `interpreter/shelf/runtime.ts` | 1508–1580 | `createAutoProvisionedShelveExecutable`: build a write-alias dispatch function for scoped access |
| `interpreter/shelf/runtime.ts` | 1829–1865 | `normalizeScopedShelfConfig`: convert `box.shelf { read, write }` into a `NormalizedShelfScope` |
| `interpreter/shelf/runtime.ts` | 1867–1871 | `getNormalizedShelfScope`: retrieve active shelf scope from Environment's scoped config |
| `interpreter/shelf/runtime.ts` | 1873–1897 | `serializeShelfDefinition` / `isSerializedShelfDefinition`: serialize shelf + referenced records as `{ __shelf: true, definition, records }` |
| `interpreter/eval/shelf.ts` | 1–46 | **Entry point**: evaluate `/shelf` directives. Resolve record definitions, build shelf metadata, register in Environment, create shelf variable |
| `interpreter/eval/box.ts` | 767, 23 | Integrate shelf scope into box environment via `normalizeScopedShelfConfig` |
| `interpreter/eval/import/variable-importer/ModuleExportSerializer.ts` | 149–154 | Export path: detect `variable.internal.isShelf === true`, call `serializeShelfDefinition` |
| `interpreter/eval/import/VariableImporter.ts` | 319–343 | Import path: detect `isSerializedShelfDefinition`, register records + shelf definition in target Environment |
| `interpreter/env/Environment.ts` | 323, 1630–1646 | Shelf storage: `private shelfState` Map; `registerShelfDefinition`, `getShelfDefinition` |
| `interpreter/env/Environment.ts` | 1683–1707 | `readShelfSlot`: retrieve value, emit stale-read trace |
| `interpreter/env/Environment.ts` | 1709–1738 | `writeShelfSlot`: store value, record write in trace manager, emit trace event |
| `interpreter/env/Environment.ts` | 1740–1768 | `clearShelfSlot`: delete value, emit trace event |
| `core/validation/shelf-definition.ts` | — | Validate shelf directives and slot constraints |
| `core/validation/shelf-scope.ts` | — | Validate read/write bindings, detect conflicts |
| `interpreter/tracing/RuntimeTraceShelfTracker.ts` | 14–59 | Track shelf writes by scope signature for stale-read detection |
| `interpreter/utils/field-access.ts` | 643–690 | Handle `ShelfSlotRefValue` field access: unwrap to `.data` or `.current`, preserve wrapper metadata |

---

## Key Code Excerpts

### 1. Shelf Grammar

`grammar/directives/shelf.peggy:1–32`

```peggy
SlashShelf
  = DirectiveContext ShelfKeyword _ "@" id:BaseIdentifier _ "=" _ body:ShelfBody ending:StandardDirectiveEnding {
      const identifierNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      const values = {
        identifier: [identifierNode],
        slots: body.slots
      };
      return helpers.createStructuredDirective(DirectiveKind.shelf, 'shelf', values, ...);
    }
```

**Session analog:** grammar follows `var session @planner = {...}` (as labeled-var form per session spec §4). The RHS is a JSON-shaped object where field values are `TypeExpr` (primitives, `@record`, `@record[]`, `@record?`) rather than shelf's slot definitions. Parser side is almost identical; differences are in storage layer and runtime-instance-vs-frame lifetime.

### 2. Shelf Type Validation — REUSABLE FOR SESSION

`interpreter/shelf/runtime.ts:501–600`

```typescript
async function validateShelfRecordValue(options: {
  value: unknown;
  definition: RecordDefinition;
  env: Environment;
  shelfName: string;
  slotName: string;
  strictFactInputs: boolean;
}): Promise<StructuredValue<Record<string, unknown>>> {
  for (const field of options.definition.fields) {
    let rawFieldValue = await evaluateFieldValue(field, context, options.env);
    if (rawFieldValue === undefined || rawFieldValue === null) {
      if (!field.optional) {
        throw new MlldInterpreterError(`Missing required field '${field.name}'...`);
      }
      continue;
    }
    const coerced = coerceFieldValue(field, rawFieldValue, options.env);
    if (!coerced.ok) throw error;
    shaped[field.name] = coerced.value;
  }
}
```

**Session reuse:** Extract this into a shared `validateRecordFieldValues(definition, value, env, errorContext)` helper. Session writes call it with their own error context; shelf writes keep their existing context. No fact minting — session slots are input-style.

### 3. Shelf Write Path

`interpreter/shelf/runtime.ts:989–1075`

```typescript
async function writeToShelfSlot(target, value, env, callLabel = '@shelve'): Promise<StructuredValue> {
  const ref = extractShelfSlotRef(target);
  assertShelfWriteAllowed(env, ref);
  const storageEnv = resolveShelfTargetEnv(target, env);
  const shelf = storageEnv.getShelfDefinition(ref.shelfName);
  const slot = shelf?.slots[ref.slotName];
  const recordDefinition = storageEnv.getRecordDefinition(slot.record);
  
  const validatedItems = await Promise.all(
    incomingItems.map(item =>
      validateShelfRecordValue({value: item, definition: recordDefinition, env, ...})
    )
  );
  
  storageEnv.writeShelfSlot(ref.shelfName, ref.slotName, next, {traceScope, traceEnv: env});
  return createShelfSlotReferenceValue(storageEnv, ref.shelfName, ref.slotName, ...);
}
```

**Session analog:** Same pattern — extract target (session name + slot), validate value, commit to per-call session store (NOT Environment), emit trace, return value.

### 4. Shelf Read Path

`interpreter/shelf/runtime.ts:1077–1097`

```typescript
async function readShelfSlot(target, env, callLabel = '@shelf.read'): Promise<StructuredValue> {
  const ref = extractShelfSlotRef(target);
  const storageEnv = resolveShelfTargetEnv(target, env);
  ensureShelfSlotAvailable(storageEnv, ref);
  return createShelfSlotReferenceValue(storageEnv, ref.shelfName, ref.slotName, {...}).current;
}
```

**Session analog:** Sessions expose reads via dotted field access (`@planner.runtime`) rather than a method call. Fetch from per-call store, return StructuredValue snapshot.

### 5. Shelf Slot Reference — Capability Value

`core/types/shelf.ts:27–101`

```typescript
export class ShelfSlotRefValue<T = unknown> {
  constructor(ref: ShelfScopeSlotRef, current: ShelfSlotRefSnapshot<T>) {
    Object.defineProperty(this, SHELF_SLOT_REF_VALUE_SYMBOL, {value: true, ...});
    Object.defineProperty(this, SHELF_SLOT_REF_METADATA, {...});
    Object.defineProperty(this, SHELF_SLOT_REF_CURRENT, {value: current, ...});
  }
  get shelfName(): string { ... }
  get slotName(): string { ... }
  get current(): ShelfSlotRefSnapshot<T> { ... }
  get text(): string { return this.current.text; }
  get data(): T { return this.current.data; }
  toString(): string { return this.text; }
}
```

**Session does NOT use slot references.** The declared session name itself (`@planner`) is context-dependent: schema outside frame, live instance inside. No separate ref layer. Sessions are simpler: no `@shelf.read(ref)` indirection; just `@planner.field` or `@planner.set(...)`.

### 6. Environment Storage

`interpreter/env/Environment.ts:323, 1630–1646`

```typescript
private shelfState?: Map<string, Map<string, unknown>>;

registerShelfDefinition(name: string, definition: ShelfDefinition): void {
  if (!this.shelfDefinitions) this.shelfDefinitions = new Map();
  this.shelfDefinitions.set(name, definition);
}

getShelfDefinition(name: string): ShelfDefinition | undefined {
  return this.shelfDefinitions?.get(name) ?? this.parent?.getShelfDefinition(name);
}
```

**Session differs fundamentally:** Sessions will NOT live in the Environment. Instead, live instances live in the **per-call bridge frame** (same place as handle mint table and proof-claims-registry). The Environment registers the declaration (schema); the bridge frame materializes the instance. This is the key architectural divergence.

### 7. Module Export/Import

`interpreter/eval/import/variable-importer/ModuleExportSerializer.ts:149–154`

```typescript
if (variable.internal?.isShelf === true && context.childEnv) {
  const definition = context.childEnv.getShelfDefinition(name);
  if (definition) {
    return serializeShelfDefinition(context.childEnv, definition);
  }
}
```

`interpreter/shelf/runtime.ts:1873–1897`

```typescript
export function serializeShelfDefinition(env, definition): SerializedShelfDefinition {
  const records = Object.fromEntries(
    Array.from(new Set(Object.values(definition.slots).map(slot => slot.record)))
      .map(recordName => [recordName, env.getRecordDefinition(recordName)])
      .filter((entry): entry is [string, RecordDefinition] => Boolean(entry[1]))
  );
  return {
    __shelf: true,
    definition,
    ...(Object.keys(records).length > 0 ? { records } : {})
  };
}
```

**Session analog:** `SerializedSessionDefinition` with `{ __session: true, definition, records }`. Imported session schemas register in target Environment, ready to be attached to LLM calls. Per-call instances never export.

---

## Extension Points for Session Implementation

1. **Grammar — var Label Addition** (`grammar/patterns/security.peggy:39`, `grammar/directives/var.peggy:9`)
   - Add `session` to reserved-label list
   - Add `sessionSegment:(HWS "session")?` parsing
   - Set `meta.isSessionLabel = true` flag

2. **Type Definition** (new file: `core/types/session.ts`)
   - Define `SessionDefinition`, `SessionFrameInstance`, `SerializedSessionDefinition`
   - No equivalent of `ShelfSlotRefValue` needed (sessions use name-based access, not ref objects)

3. **Runtime Storage — Per-Call Frame Instance** (`core/types/bridge-frame.ts` or equivalent)
   - Attach `sessions: Map<SessionDeclarationId, SessionInstance>` to bridge frame
   - Materialized at bridge entry, disposed at exit

4. **Evaluation — Session Declaration Handler** (new file: `interpreter/eval/session.ts`, analog to `interpreter/eval/shelf.ts`)
   - Entry point `evaluateSession`, registers schema in Environment, creates session variable

5. **Named-Accessor Resolution** (extends `interpreter/core/interpreter/resolve-variable-reference.ts` or `interpreter/eval/expressions.ts`)
   - When resolving `@planner`, check Environment for session declaration with that name
   - Inside attached bridge frame → live instance; outside → schema
   - NEW code path in variable reference resolution; shelves don't have this dual resolution

6. **Live Instance Method Dispatch** (extends `interpreter/eval/exec/builtins.ts`)
   - Compile session method calls: `.set()`, `.write()`, `.update()`, `.append()`, `.increment()`, `.clear()`
   - Each method validates value against declared type before committing

7. **Slot Type Validation** (extract shared helper from `interpreter/shelf/runtime.ts:501–600`)
   - Refactor `validateShelfRecordValue` → shared `validateRecordFieldValues`
   - Shelf and session both consume it

8. **Trace Events** (new events in `interpreter/tracing/events.ts`)
   - `traceSessionSeed`, `traceSessionWrite`, `traceSessionFinal`

9. **With-Clause Attachment** (new module: `interpreter/eval/exec/session-attachment.ts` or extend `scoped-runtime-config.ts`)
   - When LLM call carries `with { session: @planner }`, extract declaration, materialize instance, apply seed

10. **Guard Integration** (`interpreter/eval/guards/*`)
    - Per-guard session-write buffer for write-commit-on-deny semantics
    - No existing precedent for this (see guard-dispatch dossier)

11. **Module Export/Import** (extend `ModuleExportSerializer.ts:149` and `VariableImporter.ts:319`)
    - Detect `isSession === true` marker; call `serializeSessionDefinition` / `isSerializedSessionDefinition`

12. **Redaction** (new file: `interpreter/tracing/redact.ts`)
    - Implement label-aware filtering for trace events at `--trace effects` vs `--trace verbose`

---

## Flags & Caveats

1. **Deep-clone hazards apply to session too.** Spread operators or `JSON.stringify` before writing to a session will lose identity. Session docs should warn.

2. **Label semantics differ from shelf.** Session writes preserve label set of the written value (simple: sessions are transient, label preservation is stronger). Shelf's conditional preservation (`◐` in DATA.md matrix) does not apply.

3. **Fact-field handling is shelf-specific.** `validateShelfRecordValue` requires handle-bearing input in certain contexts. Sessions do NOT mint facts (spec §7). Records used as session slot types must be input-style. Material divergence in the shared validator.

4. **Shelf scope enforcement (`box.shelf { read, write }`) does NOT apply to sessions.** Session visibility is all-or-nothing per frame.

5. **Lifecycle boundaries differ:**
   - Shelf: lives as long as Environment (execution)
   - Session: lives as long as LLM bridge frame (one call)
   - Storage layers are completely separate

6. **Tracing precision:** Stale-read detection (shelf's `RuntimeTraceShelfTracker`) is not needed for sessions — callbacks are ordered within a single tool-callback sequence.

7. **Module boundary:** Only schemas export; per-call instances never do. Same principle as shelves.

8. **Execution-wide state aliasing is a shelf bug when used as pseudo-session.** Session design eliminates this by making frame isolation absolute — code paths must never leak state across concurrent frames.

---

## Non-Goals Confirmation

This dossier documents the shelf subsystem end-to-end. It does NOT:
- Design the session implementation
- Write any session code
- Modify existing shelf code
- Propose changes to shelf itself
- Make implementation decisions beyond identifying extension points

The dossier is ready for the planner to use as a reference when designing session, by analogy to shelf.
