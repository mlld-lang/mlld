---
id: shelf-slots
title: Shelf Slots
brief: Typed state accumulation with record-backed grounding, cross-slot constraints, and access control
category: security
tags: [shelf, slots, state, records, handles, grounding, security, agents]
related: [facts-and-handles, records-basics, policy-authorizations, pattern-planner, fyi-known]
related-code: [spec-shelf-slots.md]
updated: 2026-04-04
---

Shelf slots are the typed state accumulation surface for agents. Each slot is backed by a record that provides schema, fact/data classification, grounding, and display projection. The shelf adds merge semantics, cross-slot constraints, and access control.

## Declaration

```mlld
record @contact = {
  key: id,
  facts: [id: string, email: string, name: string],
  data: [notes: string?, score: number?],
  display: [name, { ref: "email" }]
}

shelf @outreach = {
  recipients: contact[],
  selected: contact? from recipients,
  drafts: email_draft[]
}
```

Each slot has a record type, a cardinality (`[]` for collection, bare for singular, `?` for optional), and an optional `from` constraint.

## Grounding on writes

Agent writes to slots are stricter than tool calls. Fact fields require handle-bearing input only — masked previews and bare literals are rejected:

| Form | Tool call arg | Slot write fact field |
|---|---|---|
| Handle wrapper `{ handle: "h_x" }` | Accepted | Accepted |
| Bare handle string `"h_x"` | Accepted | Accepted |
| Masked preview `"m***@example.com"` | Accepted | **Rejected** |
| Bare literal `"mark@example.com"` | Accepted | **Rejected** |

Slots are durable state. Durable state gets durable references. Data fields have no grounding requirement — agents pass any value.

## Merge semantics

| Slot type | Record has `key`? | Default merge |
|---|---|---|
| `record[]` | yes | upsert by key |
| `record[]` | no | append |
| `record` | — | replace |

Upsert replaces the entire row — no deep field merge. Override with the expanded form: `log: { type: contact[], merge: "append" }`.

## Cross-slot constraints

`from` validates that a value exists in a referenced slot at write time:

```mlld
shelf @pipeline = {
  candidates: contact[],
  qualified: contact[] from candidates,
  winner: contact? from qualified
}
```

An agent can't select a winner that was never a candidate. Identity uses the record's `key` when available (resilient to multiple handles for the same entity). `from` is write-time only — stored values don't become retroactively invalid if the source slot changes.

## Access control

Box config grants per-slot access:

```mlld
box {
  shelf: { write: [@outreach.recipients] }
} [...]

box {
  shelf: {
    read: [@outreach.recipients],
    write: [@outreach.selected]
  }
} [...]
```

Write implies read. `@shelf` is automatically provided where write-capable slot refs are in scope, and `@shelve(...)` remains write sugar plus a compatibility alias surface:

```mlld
@shelf.write(@pipeline.candidates, @candidate)
@shelve(@pipeline.candidates, @candidate)
@shelf.read(@pipeline.candidates)
@shelf.clear(@pipeline.candidates)
@shelf.remove(@pipeline.candidates, "h_abc")
```

`@shelf.read(@slotRef)` returns the current stored contents of that slot with full structured values intact. Agents still read via `@fyi.shelf.outreach.recipients`, which applies display projections for the scoped shelf view.

## Dynamic aliasing

Scoped boxes can alias slot refs to the exact names an agent should use:

```mlld
box {
  shelf: {
    read: [@taskBrief as brief, @outreach.recipients as candidates],
    write: [@pipeline.execution_log as execution_log]
  }
} [...]
```

- `@fyi.shelf.brief` exposes the aliased readable value
- `@fyi.shelf.candidates` exposes the aliased slot contents with display projection
- `@fyi.shelf.execution_log` is still a slot ref under the hood, so it works with the full slot API:

```mlld
@shelf.write(@fyi.shelf.execution_log, @value)
@shelve(@fyi.shelf.execution_log, @value)
@shelf.read(@fyi.shelf.execution_log)
@shelf.clear(@fyi.shelf.execution_log)
@shelf.remove(@fyi.shelf.execution_log, @value)
```

Aliases are agent-facing names. The agent does not need to know the original slot variable. Aliases that target different slots are rejected, and write aliases must resolve to real shelf slot refs.

## Agent system notes

When an `exe llm` call runs inside a shelf-scoped box, mlld automatically appends a compact `<shelf_notes>` block to the system prompt.

- Writable slots list record type, merge mode, and any `from` constraint
- Readable slots list record type
- Aliased reads and writes are shown with the name the agent actually sees, such as `@fyi.shelf.brief` or `@fyi.shelf.execution_log`
- Injection happens even when the LLM call has no `tools`
- If both notes are present, `<tool_notes>` comes first and `<shelf_notes>` follows it

This gives workers the exact shelf surface they can read and write without exposing slots outside the scoped box config.

## Trust model

- Slots **do not mint facts.** Authority flows from records and `=> record` coercion.
- `known` **does not persist** in slots. Prevents laundering across contexts.
- Writes are **atomic.** If any element fails, the entire write is rejected.
- Stored values get `src:shelf:@shelfName.slotName` for provenance tracking.
- Policy enforces at dispatch (when slot values reach tools), not at storage.

## Removal

```mlld
@shelf.clear(@pipeline.candidates)
@shelf.remove(@pipeline.candidates, "h_abc")
```

Removal requires write access. Removing from a source slot does not invalidate downstream `from` references.

## Example flow

1. **Researcher** searches contacts, shelves results with handles → `@outreach.recipients`
2. **Decider** reads candidates (display-projected), selects one → `@outreach.selected` (validated against `from recipients`)
3. **Writer** reads selected contact, sends email with handle-backed recipient → policy passes

If the writer tries a hallucinated recipient: no handle, no fact proof, blocked by `no-send-to-unknown`.

If the decider tries to select a non-candidate: `from` check fails, write rejected.
