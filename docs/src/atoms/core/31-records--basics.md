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

Supported field types: `string`, `number`, `boolean`, `array`. Array fact fields carry per-element proof -- each element gets its own `fact:` label and display projection.

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

Records can also define how fact fields cross an LLM or MCP boundary:

```mlld
record @contact = {
  facts: [email: string, name: string, phone: string?],
  data: [notes: string?],
  display: [name, { mask: "email" }]
}
```

This does **not** change ordinary runtime behavior:

- `show @contact.email` still prints the actual email
- interpolation still sees the live value
- field-level proof stays attached to the live structured value

It only changes the projected form used at the LLM boundary. With the definition above, a projected tool result looks like:

```json
{
  "name": "Ada Lovelace",
  "email": {
    "preview": "a***@example.com",
    "handle": { "handle": "h_ab12cd" }
  },
  "phone": {
    "handle": { "handle": "h_ef34gh" }
  },
  "notes": "Met at conference"
}
```

Rules:

- listed fact fields are bare-visible unless wrapped with `{ mask: "field" }`
- masked fact fields emit a safe preview plus a nested handle wrapper
- omitted fact fields become handle-only when any `display:` clause is present
- data fields remain bare

This is the primary planner-facing handle path. See `facts-and-handles` for the boundary model.

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
