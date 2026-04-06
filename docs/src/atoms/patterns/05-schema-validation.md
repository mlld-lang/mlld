---
id: pattern-schema-validation
title: Schema Validation with Records and Guards
brief: Validate LLM output shapes with records, retry on failure with schema errors as feedback
category: patterns
tags: [patterns, records, guards, schema, validation, retry, llm, agents]
related: [records-basics, security-guards-basics, exe-simple, facts-and-handles]
related-code: [interpreter/eval/records/coerce-record.ts, interpreter/hooks/guard-post-hook.ts]
updated: 2026-04-04
---

LLM exes produce unpredictable output. Records validate the shape. Guards retry on failure with the actual schema errors as feedback.

## The pattern

```mlld
record @task_result = {
  data: [status: string, summary: string, items: array?]
}

exe @analyzeTask(input) = @claude(`
  Analyze this and return JSON: { status, summary, items }
  Input: @input
`) => task_result

guard after @checkShape for op:named:analyzeTask = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => retry "Fix your output: @output.mx.schema.errors"
  @output.mx.schema.valid == false => deny "Schema invalid after retries"
  * => allow
]
```

Three pieces:

1. **Record** defines the expected shape — field names, types, optionality
2. **`=> record`** on the exe applies coercion automatically on every call
3. **Guard** checks `@output.mx.schema.valid` and retries with `@output.mx.schema.errors`

The same coercion engine is also available inline for ordinary values:

```mlld
var @checked = @raw as record @task_result
show @checked.mx.schema.valid
```

Use `=> record` when the coercion belongs to the exe's return contract. Use `as record @schema` when you need to validate or re-coerce a value inside a larger expression.

### `resume` vs `retry` for tool-calling exes

If the exe calls write tools, use `resume` instead of `retry`. `retry` re-executes the entire exe — including tool calls. That means double-sending emails, double-creating events. `resume` continues the existing LLM conversation without re-executing tools:

```mlld
guard after @fixShape for op:named:executeWorker = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => resume "Return valid JSON. Errors: @output.mx.schema.errors"
  @output.mx.schema.valid == false => deny "Still invalid after resume"
  * => allow
]
```

The LLM sees its prior tool calls and results, plus the correction message. It reformats. `=> record` coercion runs on the new response. No tools re-fire.

Use `retry` for exes without side effects (read-only tools, template exes, JS exes). Use `resume` for exes with write tools.

The LLM gets told exactly what's wrong: missing fields, wrong types, structural issues. It corrects on the next attempt.

## Supported field types

| Type | Accepts | Rejects |
|---|---|---|
| `string` | strings | numbers, booleans, arrays, objects, null |
| `number` | numbers, numeric strings (`"42"` → `42`) | non-numeric strings, booleans, arrays, objects |
| `boolean` | booleans, `"true"`/`"false"` | other strings, numbers, arrays, objects |
| `array` | arrays | strings, numbers, objects |
| `object` | plain objects | strings, numbers, arrays, null |
| `handle` | resolvable handle strings/wrappers | plain strings, numbers |

Append `?` for optional: `items: array?` means the field can be missing or null.

## Validation modes

Records support three validation modes via `validate`:

```mlld
record @strict_result = {
  data: [status: string, count: number],
  validate: "strict"
}
```

| Mode | Behavior |
|---|---|
| `demote` (default) | Any validation error demotes the whole record to data — no fact labels minted. Schema metadata is attached. Guards can inspect and retry. |
| `strict` | Any invalid field throws a hard error. Guards do NOT fire — the error propagates before the after-guard evaluates. |
| `drop` | Invalid fields are silently dropped; valid fields keep their classification. Schema metadata is attached. |

For LLM output validation with guard retry, use `demote` (default) or `drop`. Do NOT use `strict` — it throws before the guard fires, making retry impossible. `demote` is the right choice for most LLM output validation: the value is accessible (for debugging), schema errors are available (for retry feedback), and the guard controls what happens next.

## Schema metadata

After `=> record` coercion, the output carries:

- `@output.mx.schema.valid` — boolean
- `@output.mx.schema.errors` — array of `{ path, code, message }`
- `@output.mx.schema.mode` — which validation mode was used

Guards access these directly:

```mlld
guard after @check for op:named:myExe = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => retry "Fix: @output.mx.schema.errors"
  * => allow
]
```

The retry message includes the actual errors. The LLM sees "missing required field: count" not "return valid JSON."

Inline `as record @schema` attaches the same `mx.schema` metadata, so grouped expressions like `(@value as record @schema).mx.schema.errors` work the same way.

## Nested output validation

For outputs with nested structure:

```mlld
record @worker_output = {
  data: [
    worker: string,
    summary: string?,
    state_patch: object
  ]
}
```

`object` validates that `state_patch` is a plain object. It doesn't validate internal structure. For deeper validation:

**Option A: flatten.** Move important nested fields to the top level:

```mlld
record @worker_output = {
  data: [
    worker: string,
    summary: string?,
    results: array,
    created_refs: object?
  ]
}
```

**Option B: two-stage coercion.** Validate the outer shape with the exe record, validate inner structure in the guard:

```mlld
record @outer = {
  data: [worker: string, state_patch: object]
}

record @result_entry = {
  data: [tool: string, status: string, details: string?]
}

exe @worker(...) = @claude(...) => outer

guard after @checkInner for op:named:worker = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => retry "Fix outer shape: @output.mx.schema.errors"
  * => allow
]
```

Start with `object` for nested fields. Add deeper validation only if the simple version isn't catching enough.

## Facts vs data in validated output

Records classify fields as facts or data. For LLM output validation, most fields are `data` — the LLM's output isn't authoritative in the record/fact sense:

```mlld
record @extraction_result = {
  data: [category: string, urgency: string, summary: string]
}
```

Use `facts` only when the exe returns data from an authoritative source (a tool result, a database query) — not for LLM-generated classifications:

```mlld
record @contact = {
  facts: [id: string, email: string, name: string],
  data: [notes: string?]
}

exe @searchContacts(query) = run cmd {
  contacts-cli search @query --format json
} => contact
```

## LLM output parsing

`=> record` handles messy LLM output automatically:

1. Strips prose and markdown fences
2. Parses JSON (or YAML)
3. Coerces types (`"42"` → `42` for number fields)
4. Validates required fields
5. Reports errors on `@output.mx.schema`

No `@parse.llm` step needed when using `=> record`. The record IS the parser + validator.

## Worker validation pattern

For agents with phase-shaped workers (resolve, extract, execute, compose), each worker gets its own record:

```mlld
record @resolve_output = {
  data: [worker: string, summary: string?, state_patch: object]
}

record @extract_output = {
  data: [worker: string, summary: string?, state_patch: object]
}

record @execute_output = {
  data: [worker: string, summary: string?, state_patch: object]
}

exe @resolveWorker(...) = @claude(...) => resolve_output
exe @extractWorker(...) = @claude(...) => extract_output
exe @executeWorker(...) = @claude(...) => execute_output

guard after @checkResolve for op:named:resolveWorker = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => retry "Fix: @output.mx.schema.errors"
  * => allow
]

guard after @checkExtract for op:named:extractWorker = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => retry "Fix: @output.mx.schema.errors"
  * => allow
]

guard after @checkExecute for op:named:executeWorker = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => retry "Fix: @output.mx.schema.errors"
  * => allow
]
```

Same pattern for every worker. The record defines the contract. The guard enforces it with retry. No JS validation functions.

## Extract-to-write contracts

When an extract phase produces data that feeds a downstream write tool, the record schema is the contract between them. Shape the extract record's fields to match the write tool's parameter names exactly — then the planner can pass extracted values through without renaming, and wrong field names fail coercion.

The wrong shape causes drift. Consider an extract step that produces `email_subject` and `email_recipient`, followed by a planner that synthesizes a `send_email(recipients, subject, body)` call. The rename step is where values drift — the planner reconstructs field names and often copies nearby prose instead of the extracted literals.

The right shape is to define a record whose fields match `send_email`'s parameters:

```mlld
record @sendEmailInput = {
  data: {
    trusted: [subject: string, body: string],
    untrusted: [recipients: string]
  }
}

exe @extractSendEmailInput(source_content) = [
  >> LLM extracts the data, shaped to match the record
  => @claude(`Extract subject, body, and recipients from: @source_content`)
] => sendEmailInput

guard after @checkExtract for op:named:extractSendEmailInput = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => retry "Wrong shape: @output.mx.schema.errors. Required fields: subject, body, recipients."
  * => allow
]
```

If the LLM returns `email_subject` instead of `subject`, `=> record` coercion fails and the guard retries with the schema errors. The record's field names ARE the contract — there's nothing for the next phase to rename.

Note the `data: { trusted, untrusted }` split: `subject` and `body` can be LLM-composed from source content (trusted for read-only use), while `recipients` stays untrusted because it needs resolution through the contacts directory before it can be used as a control arg in `send_email`. This is phase discipline: **extract doesn't resolve**. If the source gives you a name but not an email, extract produces `person_name`, not `recipients`. A separate resolve step turns `person_name` into a handle.

When possible, define the extraction record once per write tool shape (one record for email inputs, one for calendar inputs, etc.) so the contract is visible and reusable. The downstream write tool's parameter list is the source of truth — the record mirrors it.

### Dynamic coercion for framework-driven contracts

When a framework takes contracts as configuration (e.g., `@rig.build({ contracts: { email: @emailPayload } })`), the extract worker needs to coerce output against a record that was passed in, not one referenced statically by name. Use `=> record @schema`:

```mlld
>> The extract worker takes the contract as a parameter
exe @extractWorker(source, target, contract) = [
  => @claude(`
    Extract data matching this shape from: @source
    Target: @target
  `) => record @contract
]

guard after @checkExtract for op:named:extractWorker = when [
  @output.mx.schema.valid == false && @mx.guard.try < 2
    => retry "Schema errors: @output.mx.schema.errors"
  * => allow
]
```

The orchestration layer picks the right contract from a configured map:

```mlld
import { @emailPayload, @assignmentRows } from "./domain/contracts.mld"

var @contracts = {
  email_task_payload: @emailPayload,
  assignment_rows: @assignmentRows
}

>> The planner requested contract_name: "email_task_payload"
let @contract = @contracts[@request.contract_name]
let @result = @extractWorker(@source, @target, @contract)
```

The record definitions live in the domain layer. The framework takes them as configuration and coerces extract output against the chosen one. Wrong field names still fail coercion, the guard still retries with schema errors — same enforcement, but the framework doesn't need to know about `email_task_payload` or `assignment_rows` specifically. The developer's domain records are the contract.

This is the pattern that makes framework-driven capability agents possible. The framework owns orchestration, phases, guards, and policy integration. The developer owns records, tools, and contracts. Dynamic coercion is the interface between them.

## What this replaces

JS shape validators like:

```mlld
exe @isValidResult(output) = js {
  return Boolean(
    output
    && typeof output === "object"
    && !Array.isArray(output)
    && output.worker === "execute_capability"
    && output.state_patch
    && typeof output.state_patch === "object"
  );
}
```

become:

```mlld
record @execute_output = {
  data: [worker: string, summary: string?, state_patch: object]
}

exe @worker(...) = @claude(...) => execute_output
```

The record validates. The guard retries. The JS is deleted.
