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
