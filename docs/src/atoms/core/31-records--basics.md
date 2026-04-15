---
id: records-basics
title: Records
brief: Declare field-level classification for structured tool input and output
category: core
tags: [records, facts, data, schema, coercion, validation, structured-output]
related: [exe-simple, labels-overview, labels-attestations, facts-and-handles, labels-facts]
related-code: [core/types/record.ts, interpreter/eval/record.ts, interpreter/eval/records/coerce-record.ts, grammar/directives/record.peggy]
updated: 2026-04-15
qa_tier: 2
---

Records declare which fields in structured data are authoritative facts and which are informational content. The same field syntax is used for two different directions:

- **Output records** shape `=> record` / `as record` coercion and optional `display:` projections
- **Input records** shape surfaced tools through `inputs: @record` on a tool collection entry

Field syntax is the same in both directions: `name: type?` means an optional field. `name?: type` is not valid mlld syntax.

For tool results, this is also the canonical secure data-plane return path to an LLM caller. Returning through `=> contact`, `=> record @schema`, or `=> @cast(@value, @schema)` turns on record-mediated return filtering at the bridge: the active `role:*` display projection shapes what the LLM sees.

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

## Use records as tool input contracts

`var tools` can point at an input-capable record with `inputs: @record`:

```mlld
var @approvedRecipients = ["ada@example.com", "team@example.com"]

record @send_email_inputs = {
  facts: [recipient: string, cc: string?, bcc: string?],
  data: {
    trusted: [subject: string],
    untrusted: [body: string?]
  },
  exact: [subject],
  allowlist: {
    recipient: @approvedRecipients,
    cc: @approvedRecipients,
    bcc: @approvedRecipients
  },
  optional_benign: [cc, bcc],
  validate: "strict"
}

exe tool:w @sendEmail(recipient, cc, bcc, subject, body) = run cmd {
  mail-cli send --to @recipient --cc @cc --bcc @bcc --subject @subject --body @body
}

var tools @agentTools = {
  send_email: {
    mlld: @sendEmail,
    inputs: @send_email_inputs,
    labels: ["execute:w", "exfil:send", "comm:w"]
  }
}
```

For record-backed tool inputs:

- visible tool args are the record fields that match executable params, after any `bind` keys are removed
- on write surfaces, record `facts` become the tool's effective control args
- on read-only surfaces, record `facts` become the tool's effective source args
- `data.trusted` fields must stay trusted at dispatch time, but they do not carry fact proof
- `data.untrusted` and plain `data` fields are payload fields, not authorization-grade identifiers
- `validate: "strict"` enforces required fields and types before the executable body runs
- `exact`, `update`, `allowlist`, `blocklist`, and `optional_benign` are top-level input-only policy sections for surfaced tools

When a write-tool input record has more than one fact field, set `correlate: true` to require that those fact values came from the same source record instance:

```mlld
record @send_payment_inputs = {
  facts: [recipient: string, tx_id: string],
  data: [body: string],
  correlate: true,
  validate: "strict"
}
```

That turns on the same-source check for multi-fact write inputs without any extra per-exe metadata.

The input-only policy sections are:

- `exact: [field, ...]` — listed data fields must appear verbatim in the task text supplied to `@policy.build(..., { task })`
- `update: [field, ...]` — mutation fields for update-style tools; at least one must be present, and the surfaced tool must carry `update:w` in `labels`
- `allowlist: { field: @set }` — values must be present in the named set
- `blocklist: { field: @set }` — values must not be present in the named set
- `optional_benign: [field, ...]` — acknowledges optional fact fields whose omission is benign and suppresses the validator advisory

`display:` is output-only. Any record that declares `display:` is an output record, and any record that declares input-only sections such as `exact`, `update`, `allowlist`, `blocklist`, or `optional_benign` is an input record. Mixing the two directions is a validation error.

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
    role:worker: [{ mask: "from" }, subject, body],
    role:planner: [{ ref: "from" }, { ref: "message_id" }, needs_reply]
  }
}
```

Worker sees subject and body (its job to read them), from is masked. Planner sees from and message_id as ref (readable + handle), sees needs_reply, doesn't see subject or body (injection surfaces omitted).
Use the exact mode key you declared. `role:planner` is not an alias for `planner`.

A display mode can be declared in three places. From least to most specific:

1. **exe definition** — `exe @worker(...) with { display: "role:worker" } = ...`. The default mode every invocation of this exe uses.
2. **box config** — `box { display: "role:worker" } [...]`. Applies to llm calls inside the box.
3. **call site** — `@claude(...) with { display: "role:worker" }`. Applies to a single llm call.

A more specific declaration overrides a less specific one. The call site is the most specific and always wins.
If no explicit display is set, mlld also checks the active llm exe labels. A label such as `role:planner` selects the matching display key by default.

```mlld
>> Box-level: every llm call inside this box uses worker mode
box @worker with { tools: [@readEmail], display: "role:worker" } [...]

>> Call-site: this single llm call uses worker mode
var @result = @claude(@prompt, { tools: @readTools }) with { display: "role:worker" }

>> Box sets one mode, call site overrides it for one call
box { display: "role:planner" } [
  show @claude(@prompt, { tools: @readTools }) with { display: "role:worker" }
]
```

After m-2808, all three forms apply correctly to shelf reads (`@fyi.shelf.<alias>`) inside the scope, not just to tool result projections — the active display mode shapes what the agent sees through `@fyi.shelf` the same way it shapes tool result wrappers.

**Idiomatic pattern:** for dispatcher-style orchestrators that run multiple llm calls under different modes, set `with { display }` on each `@claude(...)` call rather than wrapping each call in its own box. The dispatch is the natural unit of mode selection — one prompt, one tool surface, one display mode — and inline `with { display }` reads more clearly than boxes that wrap a single call.

Each named mode is a strict whitelist on its own: unlisted fields are omitted entirely. Switching modes replaces the prior whitelist; there's no cross-mode union. Single-list `display: [...]` preserves backward compatibility — unlisted facts become handle-only and data fields remain visible. `"strict"` is a built-in mode that makes every fact handle-only and omits every data field.

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

## Records as first-class values

A `record @foo` declaration registers two things: the record definition (used for static coercion via `=> foo`) and a record value (`@foo`) that can be passed around like any other mlld value.

```mlld
record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?]
}

>> @contact is now a value you can reference, import, export, store, and pass
show @contact
```

`show @contact` prints the record in declaration form:

```
record contact {
  facts: [email: string, name: string]
  data: [notes: string?]
}
```

### Import and export

Records flow through the standard variable import/export paths:

```mlld
>> domain/records.mld
record @contact = { facts: [email: string] }
record @email_msg = { facts: [from: string], data: [body: string] }

export { @contact, @email_msg }
```

```mlld
>> agent.mld
import { @contact, @email_msg } from "./domain/records.mld"

exe @fetchContact(id) = run cmd { contacts-cli get @id } => contact
```

The imported records work identically to records declared in the same file.

### Records as parameters and in collections

Records can be passed as exe parameters and stored in objects or arrays:

```mlld
record @email_task_payload = {
  data: {
    trusted: [subject: string, body: string],
    untrusted: [recipients: string]
  }
}

record @assignment_rows = {
  data: [rows: array]
}

var @contracts = {
  email: @email_task_payload,
  tasks: @assignment_rows
}

exe @extract(source, contract) = [
  => @claude(`Extract from: @source`) => record @contract
]

var @result = @extract(@source_text, @contracts.email)
```

Records stored in collections render as their declaration form when displayed — same as top-level records.

### Dynamic coercion: `=> record @schema` and `as record @schema`

Static coercion uses a bare record name:

```mlld
exe @emitContact() = js { return { email: "ada@example.com" } } => contact
```

Dynamic coercion uses a variable reference prefixed by the `record` keyword. There are two forms:

- `=> record @schema` for exe return coercion
- `@value as record @schema` for inline value coercion in ordinary expressions

```mlld
exe @validate(input, schema) = [
  => @input => record @schema
]
```

```mlld
var @checked = @raw as record @schema
var @valid = (@raw as record @schema).mx.schema.valid
```

The `record` keyword disambiguates — `=> @schema` alone could be ambiguous, but `=> record @schema` is explicitly "coerce the output against the record referenced by `@schema`." The same applies to inline coercion: `@raw as record @schema` means "take this value and coerce it against the record referenced by `@schema`."

`@cast(@value, @schema)` is the builtin form of the same runtime coercion path:

```mlld
var @checked = @cast(@raw, @schema)
var @valid = @cast(@raw, @schema).mx.schema.valid
```

Use postfix `as record` when it reads naturally in an expression chain. Use `@cast(...)` when you want an ordinary function call form, for example inside another call or when the schema is already being passed around as data.

For tool returns, `=> record @schema` and `=> @cast(@value, @schema)` are equivalent ways to enable the record-mediated planner/LLM view. Choose the form that fits the surrounding expression best.

Inline coercion is terminal postfix syntax. Producer modifiers happen before it, and field access after coercion needs grouping:

```mlld
run cmd { ... } with { policy: @p } as record @schema
(@raw as record @schema).mx.schema.errors
```

**Nested references work:**

```mlld
var @contracts = {
  email: @email_task_payload,
  tasks: @assignment_rows
}

exe @extract(source, contractName) = [
  let @contract = @contracts[@contractName]
  => @claude(`Extract from: @source`) => record @contract
]

var @result = @extract(@source, "email")
```

Resolution happens at runtime. If `@contract` doesn't reference a record, coercion fails with a clear error.

### When to use dynamic coercion

Static `=> contact` is the common case — use it whenever the record is known at write time. Dynamic `=> record @schema` and `@value as record @schema` are for patterns where the contract is passed in as configuration:

- **Framework-driven coercion.** A framework (like the capability agent pattern) takes a contract map from the developer and coerces extract output against the appropriate record at runtime.
- **Contract-per-write-tool patterns.** The extract phase emits data shaped for a downstream write tool. The contract for each write tool is defined once, passed into the extract worker, and coerced dynamically.
- **Shared validation exes.** A single `@validate` exe that takes both data and a schema, used across many records.
- **Inline validation within larger expressions.** Coerce a pipeline result, object field, array item, or direct variable before continuing the expression.

If you're writing a single-use exe with a known record, static coercion is simpler. Reach for dynamic coercion when the same exe or expression path needs to validate against different contracts at different call sites.

**Verified coercion paths.** The record coercion tests cover `=> record` across `js`, `cmd`, `sh`, `node`, `py`, and imported MCP-backed wrapper exes, plus inline `@value as record @schema`. Arrays of records and shelf write/read round-trips are also verified to preserve `mx.factsources` metadata.

## What records are not

Records are pure data-shaping definitions. They cannot:

- Call tools or exes
- Mutate environment state
- Access the filesystem or network
- Depend on non-deterministic runtime state

This keeps records predictable, testable, and security-reviewable.

See `facts-and-handles` for how records, fact labels, and handles work together in the security model. See `labels-facts` for the fact label system. See `pattern-schema-validation` for the dynamic coercion pattern in extract-to-write contracts.
