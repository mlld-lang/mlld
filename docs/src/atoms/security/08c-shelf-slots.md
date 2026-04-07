---
id: shelf-slots
title: Shelf Slots
brief: Typed state accumulation with record-backed grounding, cross-slot constraints, and access control
category: security
tags: [shelf, slots, state, records, handles, grounding, security, agents]
related: [facts-and-handles, records-basics, policy-authorizations, pattern-planner, fyi-known]
related-code: [spec-shelf-slots.md]
updated: 2026-04-07
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

Write implies read.

## The two read surfaces

Slot contents are reachable two ways. Use the right one for the context:

| Path | Audience | Projection | What it returns |
|---|---|---|---|
| `@fyi.shelf.<alias>` | LLM agent inside a scoped box | Display modes apply | The agent's view — facts may be `ref`/`mask`/`handle`, data fields may be omitted |
| `@shelf.read(@slotRef)` | Orchestrator code outside the box | None | Full structured values with fact labels, factsources, and live handles intact |

`@fyi.shelf` is what an agent reads. The record's `display` clause (and any active named display mode) shapes what the LLM sees. This is how fact fields cross the LLM boundary as handle-bearing wrappers.

`@shelf.read` is what orchestrator code reads. It returns the stored values unprojected — the same shape they had when they were written. This is the path to use when feeding slot contents into another `@shelf.write`, into a JS exe for inspection, or into a downstream tool dispatch from orchestrator code.

Shelf round-trips preserve field-local fact labels and factsources. A read-back field keeps its own `fact:@record.field` proof; sibling fact labels from the same record are not reattached to that field.

```mlld
>> Agent read (inside a box, display projection applied)
=> @claude("Pick a candidate from @fyi.shelf.candidates", { tools: [] })

>> Orchestrator read (full structured value, fact labels intact)
var @selected = @shelf.read(@pipeline.selected)
@sendEmail(@selected.email, @subject, @body)
```

Don't read via `@fyi.shelf` from orchestrator code that needs the full structured value — display projection will hide or transform fields you actually need.

**Inspecting metadata.** Fact provenance lives on individual field values, not on the record container. Reading `@contact.mx` on a record container returns its container-level metadata (often empty); reading `@contact.email.mx` on a fact field returns the field's labels, factsources, and other proof details. To inspect a value's full provenance from a JS helper, use `.keep` and read `value.mx` inside the `js {}` block — see the JS interop section in `intro` for details on `.keep`.

To inspect the **current shelf scope** (which slots the active execution context can read or write, by alias), use the ambient accessors `@mx.shelf.writable` and `@mx.shelf.readable`. They return slot-alias metadata only — use `@shelf.read(@slotRef)` if you want the actual stored values. See `builtins-ambient-mx`.

## Slot operations

`@shelf` exposes the full slot API. `@shelve(...)` is sugar for `@shelf.write` and is also the name of the auto-provisioned LLM tool described below.

```mlld
@shelf.write(@pipeline.candidates, @candidate)
@shelve(@pipeline.candidates, @candidate)
@shelf.read(@pipeline.candidates)
@shelf.clear(@pipeline.candidates)
@shelf.remove(@pipeline.candidates, "h_abc")
```

## The auto-provisioned @shelve tool

When a box grants write access to any slot, the runtime automatically injects a synthetic `shelve` tool into the LLM's tool surface alongside whatever tools the call already declared. The agent doesn't need `@shelve` listed in the box's `tools:` config — presence of writable shelf scope is sufficient.

The LLM calls `shelve` like any other MCP tool, addressing the slot by the alias the box config gave it. The runtime resolves the alias back to the underlying slot ref and runs the normal write pipeline (handle resolution → schema validation → grounding check → merge → source labeling).

```mlld
shelf @s = {
  candidates: contact[],
  selected: contact?
}

box {
  shelf: {
    read:  [@s.candidates as candidates],
    write: [@s.selected   as selected]
  }
} [
  => @claude("Pick a contact from @fyi.shelf.candidates and write it to the 'selected' slot using the shelve tool. Pass the contact exactly as it appears, including handle strings — do not transform them.", {
    model: "sonnet",
    tools: []
  })
]
```

Notes:

- The LLM calls `shelve` even though `tools: []` is set. The auto-provisioned shelve tool is independent of the user-supplied tool list — write access to a slot is what triggers it.
- The LLM passes the alias name (`selected`), not the concrete slot path (`@s.selected`). The alias is the agent-facing API.
- The agent does not call `@shelve(...)` as mlld syntax. From the LLM's perspective it is a tool call. From the runtime's perspective it is the same slot write that orchestrator code performs through `@shelf.write` — same validation, same grounding rules, same source labeling.
- `<shelf_notes>` is auto-injected into the system prompt and lists writable slot aliases, their record types, merge modes, and any `from` constraints. The agent sees the surface it can write to without you having to describe it in the prompt.

## Agent vs orchestrator write semantics

Both write paths land in the same slot and produce the same stored value, but the input requirements differ.

| Aspect | Agent write (auto-provisioned shelve) | Orchestrator write (`@shelf.write` from mlld) |
|---|---|---|
| Initiator | LLM tool call from inside a scoped box | mlld code outside the LLM bridge |
| Fact field input | Must be handle-bearing (handle wrapper or bare handle string) | Already-labeled values from `=> record` coercion or earlier slot reads |
| Data field input | Any value | Any value |
| Handle resolution | Yes — runtime resolves the agent's handle strings to live values | No — values already carry their identity |
| Schema validation | Yes | Yes |
| Grounding check | Yes — fact fields must resolve to fact-labeled values | Yes — fact fields must already carry fact labels |
| Source labeling | `src:shelf:@shelf.slot` added | `src:shelf:@shelf.slot` added |

The asymmetry is intentional: agents speak the display projection language (handles for fact fields), so the runtime must reconstruct identity at the boundary. Orchestrator code already holds live values, so it can write them directly — the value's existing factsources prove the contents are grounded.

What this means in practice:

- An agent that picks an item from `@fyi.shelf.candidates` and writes it to `selected` must pass the contact object as it appeared in the projection — including the handle strings in fact fields. The runtime resolves those handles back to the live values.
- Orchestrator code that reads `@shelf.read(@s.candidates)` can pass the resulting record straight to `@shelf.write(@s.selected, @candidate)`. No handle round-trip is needed because the value already carries fact labels and factsources.
- Fact proof survives the round-trip in both directions. A value written by an agent through shelve, read back by the orchestrator through `@shelf.read`, and dispatched to a downstream tool keeps its `fact:` labels and passes positive checks like `no-send-to-unknown`.

## Dynamic aliasing for generic wrappers

A box can use a *variable* slot ref in its shelf config, with `as <alias>` providing the agent-facing name. This lets framework code take a slot ref as a parameter and expose it under a stable role name without knowing the concrete shelf topology.

```mlld
shelf @workspace = {
  execution_log: task[],
  candidates: contact[],
  selected: contact? from candidates
}

>> Generic wrapper: takes any slot refs, exposes them under stable aliases
exe @planAndExecute(task, candidatesSlot, selectedSlot, logSlot) = [
  box {
    shelf: {
      read:  [@candidatesSlot as candidates],
      write: [@selectedSlot   as selected,
              @logSlot        as execution_log]
    }
  } [
    => @claude(@task, { model: "sonnet", tools: [] })
  ]
]

show @planAndExecute(
  "Pick the best candidate. Write it to selected. Log your reasoning to execution_log.",
  @workspace.candidates,
  @workspace.selected,
  @workspace.execution_log
)
```

Inside the box, the agent only sees `@fyi.shelf.candidates`, `@fyi.shelf.selected`, and `@fyi.shelf.execution_log` — the wrapper's role names. The same wrapper can be reused with any shelf that has compatible slot types. Aliases become the agent-facing API and decouple the agent's view from the developer's shelf structure.

When using a variable slot ref, `as <alias>` is required — the agent should never see the variable name. Static slot refs without `as` keep the slot's existing path as the implicit alias. Aliases that target different slots are rejected, and write aliases must resolve to real shelf slot refs.

`<shelf_notes>` renders the alias names, not the concrete shelf paths, so the agent's view of the surface stays consistent across different invocations of the wrapper.

Slot refs are first-class runtime values. Pass them around as exe parameters, store them in objects, dispatch them through collection lookups — anywhere a static slot ref would work, a variable holding a slot ref also works.

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

## Complete agent example

A dispatcher-style pattern that ties everything together: the orchestrator pre-populates a candidates slot, an agent reads it, picks one, and writes the choice to a selected slot via the auto-provisioned shelve tool. The orchestrator then reads the selected contact back and dispatches a downstream tool with it as a fact-bearing control arg.

```mlld
import { @claude } from @mlld/claude

record @contact = {
  key: id,
  facts: [email: string, id: string],
  data: [name: string, notes: string],
  display: [name, notes, { ref: "email" }, { ref: "id" }]
}

shelf @s = {
  candidates: contact[],
  selected: contact?
}

>> Source of fact-bearing contacts
exe @fakeSearch() = js {
  return [
    { email: "alice@example.com", id: "c1", name: "Alice", notes: "lead" },
    { email: "bob@example.com",   id: "c2", name: "Bob",   notes: "prospect" },
    { email: "carol@example.com", id: "c3", name: "Carol", notes: "lead" }
  ];
} => contact

>> Downstream tool that requires a fact-bearing recipient
exe exfil:send @sendStuff(recipient, body) = cmd {
  echo "TOOL RECEIVED recipient=@recipient body=@body"
} with { controlArgs: ["recipient"] }

>> Agent base policy. Both LLM phases below run under it via with { policy }.
>> The policy allows what the LLM driver and downstream tools need, then
>> declares the security rules that fire on the dispatched tools. Define
>> the policy as a var (not the directive form) so you can attach it
>> per-dispatch and the script's default policy stays unchanged.
var @basePolicy = {
  defaults: { rules: ["no-send-to-unknown"] },
  capabilities: { allow: ["cmd:*", "sh", "js", "node", "fs:r:**", "fs:w:**", "network"] },
  operations: { "exfil:send": ["exfil:send"] }
}

>> 1. Orchestrator populates candidates with fact-bearing contacts
var @found = @fakeSearch()
@shelf.write(@s.candidates, @found.0)
@shelf.write(@s.candidates, @found.1)
@shelf.write(@s.candidates, @found.2)

>> 2. Agent reads candidates (display-projected), picks one, writes to
>>    selected via the auto-provisioned shelve tool. tools: [] —
>>    write access to @s.selected is what triggers shelve provisioning.
>>    The base policy is attached to the @claude call so any tool the
>>    agent dispatches inside this scope is gated by the same rules.
var @reply = box {
  shelf: {
    read:  [@s.candidates as candidates],
    write: [@s.selected   as selected]
  }
} [
  => @claude(`Read @fyi.shelf.candidates. Pick the contact named "Alice" and write it to the 'selected' slot using the shelve tool. Pass the contact exactly as it appears in @fyi.shelf.candidates — including the email and id handle strings, do not transform them.`, {
    model: "sonnet",
    tools: []
  }) with { policy: @basePolicy }
]

>> 3. Orchestrator reads back the selected slot. @shelf.read returns the
>>    full structured value with fact labels and factsources intact.
var @sel = @shelf.read(@s.selected)

>> 4. Dispatch the downstream tool. Same base policy attached. The
>>    recipient carries fact:@contact.email that survived the round-trip,
>>    so no-send-to-unknown passes.
var @result = @sendStuff(@sel.email, "from selected") with { policy: @basePolicy }
show @result
```

What the security model is doing here:

- The agent only sees what the record's `display` clause exposes — fact fields cross the LLM boundary as `{ value, handle }` wrappers, so the agent has both the readable text and a referenceable handle.
- The agent's `shelve` tool call writes the contact through the slot's grounding pipeline. Fact fields must arrive as handle-bearing input; bare strings would be rejected.
- `@shelf.read` returns the stored value with `fact:@contact.email` and the original factsources still attached. Cross-phase identity rides on the value, not on the handle string.
- The downstream `@sendStuff` dispatch resolves the recipient against the proof claims registry. Because the value carries real factsources, `no-send-to-unknown` passes. A hallucinated email injected into a later message would have neither factsources nor a registry entry and would be denied.

If the agent tried to write a fabricated email like `evil@attacker.com` to `selected`, the slot write would reject it (no handle, no fact resolution). If the orchestrator skipped the slot and let the agent dispatch `@sendStuff` directly with a bare literal, `no-send-to-unknown` would catch it at the policy layer. The shelf is the structural boundary that lets the orchestrator hand a typed, grounded value off to the next phase.
