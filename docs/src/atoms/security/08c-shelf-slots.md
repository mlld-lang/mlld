---
id: shelf-slots
title: Shelf Slots
brief: Typed state accumulation with record-backed grounding, cross-slot constraints, and access control
category: security
tags: [shelf, slots, state, records, handles, grounding, security, agents]
related: [facts-and-handles, records-basics, policy-authorizations, pattern-planner, fyi-known]
related-code: [spec-shelf-slots.md]
updated: 2026-04-02
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
box @researcher with {
  tools: [@searchContacts],
  shelf: { write: [@outreach.recipients] }
} [...]

box @decider with {
  shelf: {
    read: [@outreach.recipients],
    write: [@outreach.selected]
  }
} [...]
```

Write implies read. `@shelve` is automatically provided to agents with write access. Agents read via `@fyi.shelf.outreach.recipients` with display projections applied.

## Trust model

- Slots **do not mint facts.** Authority flows from records and `=> record` coercion.
- `known` **does not persist** in slots. Prevents laundering across contexts.
- Writes are **atomic.** If any element fails, the entire write is rejected.
- Stored values get `src:shelf:@shelfName.slotName` for provenance tracking.
- Policy enforces at dispatch (when slot values reach tools), not at storage.

## Removal

```mlld
@shelve.clear(@pipeline.candidates)
@shelve.remove(@pipeline.candidates, "h_abc")
```

Removal requires write access. Removing from a source slot does not invalidate downstream `from` references.

## Example flow

1. **Researcher** searches contacts, shelves results with handles → `@outreach.recipients`
2. **Decider** reads candidates (display-projected), selects one → `@outreach.selected` (validated against `from recipients`)
3. **Writer** reads selected contact, sends email with handle-backed recipient → policy passes

If the writer tries a hallucinated recipient: no handle, no fact proof, blocked by `no-send-to-unknown`.

If the decider tries to select a non-candidate: `from` check fails, write rejected.
