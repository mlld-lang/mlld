---
id: records-basics
title: Records
brief: Declare field-level data classification for structured tool output
category: core
tags: [records, facts, data, schema, coercion, validation, structured-output]
related: [exe-simple, labels-overview, labels-attestations, facts-and-handles, labels-facts]
related-code: [core/types/record.ts, interpreter/eval/record.ts, interpreter/eval/records/coerce-record.ts, grammar/directives/record.peggy]
updated: 2026-03-25
qa_tier: 2
---

Records declare which fields in structured data are authoritative facts and which are informational content. When an exe returns data through `=> record`, the record's classification applies automatically.

**Define a record:**

```mlld
record @contact = {
  facts: [email: string, name: string, phone: string?],
  data: [notes: string?]
}
```

`facts` fields get `fact:` labels -- the source is authoritative for these values. `data` fields don't -- they're content that could contain anything. `?` marks optional fields.

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

`=> data` demotes the entire record -- no fact labels are minted:

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

- `demote` (default) -- invalid fields become data, rest stays valid
- `strict` -- any invalid field fails the entire record
- `drop` -- invalid fields are silently dropped

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
