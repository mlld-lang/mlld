---
id: records-basics
title: Records
brief: Declare field-level data classification for structured tool output
category: core
tags: [records, facts, data, schema, coercion, validation, structured-output]
related: [exe-simple, labels-overview, labels-attestations, facts-and-handles, labels-facts]
related-code: [core/types/record.ts, interpreter/eval/record.ts, interpreter/eval/records/coerce-record.ts, grammar/directives/record.peggy]
updated: 2026-03-27
qa_tier: 2
---

Records declare which fields in structured data are authoritative facts and which are informational content. When an exe returns data through `=> record`, the record's classification applies automatically.

If the exe result is labeled `untrusted`, records also refine that trust at the field level:

- `facts` fields clear the inherited exe `untrusted`
- `data` fields keep the inherited exe `untrusted`
- other labels such as `src:mcp` are preserved

**Define a record:**

```mlld
record @contact = {
  facts: [email: string, name: string, phone: string?],
  data: [notes: string?]
}
```

`facts` fields get `fact:` labels -- the source is authoritative for these values. `data` fields don't -- they're content that could contain anything. `?` marks optional fields.

**Important:** if a field contains values that a downstream write tool needs as a control arg (recipients, participants, file IDs, etc.), it must be a fact, not data. Data fields don't get handles or fact proof — they can't satisfy positive checks or flow into authorized tool calls. Array fields like `shared_with`, `recipients`, `participants` should be `facts: [...: array]` so each element gets its own handle.

Data fields can be classified as trusted or untrusted:

```mlld
record @issue = {
  facts: [id: string, number: number, author: string],
  data: {
    trusted: [title: string],
    untrusted: [body: string]
  }
}
```

`data.trusted` fields get taint cleared during trust refinement (like facts) but carry no `fact:` labels -- they're safe to read but not authorization-grade. `data.untrusted` fields stay tainted. `data: [fields]` is sugar for `data: { untrusted: [fields] }` -- safe by default.

The `when` clause can conditionally promote data fields to trusted:

```mlld
record @issue = {
  facts: [id: string, author: string],
  data: [title: string, body: string],
  when [
    @input.author_association == "MEMBER" => :maintainer {
      data: { trusted: [title] }
    }
    * => data
  ]
}
```

Maintainer issues: `title` is trusted content (taint cleared). External issues: `=> data` demotes everything to untrusted.

Supported field types: `string`, `number`, `boolean`, `array`, `handle`. Array fact fields carry per-element proof. The `handle` type requires a resolvable handle -- plain strings fail validation. Use `handle` for worker return fields that carry cross-phase identity.

**Connect to an exe with `=> record`:**

```mlld
record @contact = {
  facts: [email: string],
  data: [name: string?]
}

exe @emitContact() = js {
  return { email: "ada@example.com", name: "Ada" };
} => contact

var @contact = @emitContact()
show @contact.email
show @contact.email.mx.labels[0]
show @contact.mx.schema.valid
```

Output:

```
ada@example.com
fact:@contact.email
true
```

The `email` field carries `fact:@contact.email`. Schema validation metadata is available on `@output.mx.schema.valid` and `@output.mx.schema.errors`.

This matters for security rules. A fact field from an `exe untrusted ... => record` result keeps its `fact:` proof but loses the inherited exe-level `untrusted`. A data field from the same result stays `untrusted`.

## Display projections

`display` controls how fields cross the LLM boundary. Five visibility modes:

| Mode | Syntax | LLM sees | Handle? |
|---|---|---|---|
| **Bare** | `name` | Full value | No |
| **Ref** | `{ ref: "name" }` | Full value + handle | Yes |
| **Masked** | `{ mask: "email" }` | Preview + handle | Yes |
| **Handle** | `{ handle: "id" }` | Handle only | Yes |
| **Omitted** | (not listed) | Nothing | No |

```mlld
record @contact = {
  facts: [email: string, name: string, phone: string?],
  data: [notes: string?],
  display: [name, { ref: "email" }]
}
```

Projected tool result:

```json
{
  "name": "Ada Lovelace",
  "email": { "value": "ada@example.com", "handle": "h_ab12cd" },
  "notes": "Met at conference"
}
```

`name` is bare (readable, no handle). `email` is ref (readable + handle for downstream tool calls). `phone` is omitted (not listed — no value, no handle). `notes` is data (visible in single-list mode).

This does **not** change ordinary runtime behavior — `show @contact.email` still prints the actual email. Display only applies at the LLM boundary.

### Named display modes

Different agents need different visibility. Named modes let one record serve both:

```mlld
record @email_msg = {
  facts: [from: string, message_id: string],
  data: [subject: string, body: string, needs_reply: boolean],
  display: {
    worker: [{ mask: "from" }, subject, body],
    planner: [{ ref: "from" }, { ref: "message_id" }, needs_reply]
  }
}
```

Worker sees subject and body (its job to read them), from is masked. Planner sees from and message_id as ref (readable + handle), sees needs_reply, doesn't see subject or body (injection surfaces omitted).

Select the mode at the box level or per LLM call:

```mlld
>> Box-level (all tool results in the box use this mode)
box @worker with { tools: [@readEmail], display: "worker" } [...]

>> Call-site (this LLM session uses this mode)
var @result = @claude(@prompt, { tools: @readTools }) with { display: "worker" }
```

Call-site `with { display }` overrides box-level display. Overrides can only restrict, never widen.

In named modes, unlisted fields are omitted entirely (strict whitelist). Single-list display preserves backward compatibility (unlisted facts are handle-only, data fields remain visible). `"strict"` is a built-in override that makes all facts handle-only and omits all data.

See `facts-and-handles` for the boundary model and `pattern-planner` for the cross-phase pattern.

## Field remapping

Remap source fields with `@input.field as alias`:

```mlld
record @contact = {
  facts: [
    email: string,
    @input.organization as org: string?
  ]
}
```

`@input.organization` from the source becomes `org` in the record.

## Computed fields

Define computed fields with templates:

```mlld
record @contact = {
  facts: [
    email: string,
    { display: `@input.first @input.last` }: string
  ]
}
```

The `display` field is computed from `first` and `last` and carries the same fact classification.

## Root adapters

Records default to object-root input (`@input.field` accesses fields on the input object). For non-object inputs, root adapters make scalars and maps first-class:

**Scalar root** -- coerce a single value:

```mlld
record @username = {
  facts: [@input: string]
}
```

When applied to `"alice"`, produces a record where the value carries `fact:@username.input`. When applied to `["alice", "bob"]`, each element is coerced individually.

**Map entries** -- coerce an object as key-value pairs:

```mlld
record @channel_member = {
  facts: [@key: string, @value: string]
}
```

When applied to `{ "general": "alice", "random": "bob" }`, produces two records: one for each key-value pair. Each key and value carries its own fact label.

Root adapters compose with display projections, trust refinement, and all other record features.

## When clauses

Classify records conditionally based on input data:

```mlld
record @contact = {
  facts: [email: string],
  data: [notes: string?],
  when [
    internal => :internal
    * => :external
  ]
}
```

The `when` reads the `internal` field from the input. Internal contacts get `fact:internal:@contact.email`. External contacts get `fact:external:@contact.email`. The `*` wildcard is the default.

`=> data` demotes the entire record -- no fact labels are minted, and inherited exe `untrusted` is preserved on all fields:

```mlld
record @contact = {
  facts: [email: string],
  when [
    verified => :verified
    * => data
  ]
}
```

## Validation modes

Control what happens when fields fail type coercion:

- `demote` (default) -- any validation error demotes the whole record to data; no fact labels are minted
- `strict` -- any invalid field fails the entire record
- `drop` -- invalid fields are silently dropped; remaining valid fact fields still get normal fact labels

```mlld
record @contact = {
  facts: [email: string],
  data: [notes: string?],
  validate: "demote"
}
```

## Arrays

When an exe returns an array, each element is coerced individually:

```mlld
record @contact = {
  facts: [email: string]
}

exe @emitContacts() = js {
  return [
    { email: "a@example.com" },
    { email: "b@example.com" }
  ];
} => contact

var @contacts = @emitContacts()
show @contacts[0].email
show @contacts[1].email.mx.labels[0]
```

Output:

```
a@example.com
fact:@contact.email
```

## Array fact fields

A record field can be typed as `array`. Each element carries its own fact label and display projection:

```mlld
record @event = {
  facts: [participants: array, organizer: string],
  data: [title: string?],
  display: [title, { mask: "organizer" }]
}
```

When the exe returns `{ participants: ["a@x.com", "b@x.com"], organizer: "c@x.com", title: "Standup" }`:

- Each element of `participants` gets `fact:@event.participants`
- `organizer` gets `fact:@event.organizer`
- Display projection applies per element -- masked arrays render each element as `{ preview, handle }`

This is important for `exfil:send` operations where the destination is an array of recipients. Positive checks like `no-send-to-unknown` verify each element individually.

## Schema metadata

Record coercion attaches validation metadata:

- `@output.mx.schema.valid` -- boolean, whether validation passed
- `@output.mx.schema.errors` -- array of `{ path, code, message }` objects
- `@output.mx.schema.mode` -- the validation mode used

After-guards can use this for retry or denial:

```mlld
guard after @checkSchema for op:named:myTool = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2 => retry "Fix: @output.mx.schema.errors"
  @output.mx.schema.valid == false => deny "Schema invalid"
  * => allow
]
```

## Fact sources

Record-derived values carry `mx.factsources` metadata -- normalized source handles for provenance tracking:

```mlld
show @contact.email.mx.factsources[0].ref
```

Returns `@contact.email` -- the canonical source reference.

## What records are not

Records are pure data-shaping definitions. They cannot:

- Call tools or exes
- Mutate environment state
- Access the filesystem or network
- Depend on non-deterministic runtime state

This keeps records predictable, testable, and security-reviewable.

See `facts-and-handles` for how records, fact labels, and handles work together in the security model. See `labels-facts` for the fact label system.
