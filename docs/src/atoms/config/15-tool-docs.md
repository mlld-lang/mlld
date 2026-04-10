---
id: tool-docs
title: Tool Docs
brief: Render tool metadata into prompt-ready text or JSON for direct prompt assembly
category: config
tags: [tools, docs, prompts, agents, authorization]
related: [pattern-planner, policy-authorizations, facts-and-handles]
related-code: [interpreter/fyi/tool-docs.ts, interpreter/eval/exec/tool-metadata.ts, interpreter/env/builtins/fyi.ts]
updated: 2026-04-10
---

`@toolDocs()` renders the tool metadata mlld already enforces at runtime into prompt-ready text or JSON. Use it when you are assembling a system prompt by hand and need the LLM to see the same tool surface — names, args, control args, classification, and output fields — that the runtime will validate against.

When a tool returns `=> record`, `@toolDocs()` renders its visible output fields through the same display-projection path used at runtime. There is no separate `audience` switch. The active display selection (`with { display }`, box config, or a matching `role:*` llm label) is the shaping mechanism.

## Basic usage

```mlld
/exe execute:w @sendEmail(recipient, subject, body) = run cmd {
  email-cli send --to @recipient --subject @subject --body @body
} with { controlArgs: ["recipient"] }

/var tools @writeTools = {
  send_email: { mlld: @sendEmail }
}

/var @docs = @toolDocs(@writeTools)
/show @docs
```

Output:

```
Write tools (require authorization):

### send_email
Args:
- `recipient` (string, **control arg**)
- `subject` (string)
- `body` (string)
```

Each tool renders under its read/write section header, with one bullet per parameter. Control args are flagged inline with `**control arg**`. Tools are classified read vs write from the active policy (see "Classification" below).

## Output fields from `=> record`

When a tool has output-record metadata, `@toolDocs()` adds a `Returns:` section that describes the fields visible under the current display:

```mlld
/record @contact = {
  facts: [email: string],
  data: [name: string, notes: string],
  display: {
    role:planner: [name, { ref: "email" }],
    role:worker: [{ mask: "email" }, name, notes]
  }
}

/exe tool:r @searchContacts(query) = run cmd {
  contacts-cli search @query --format json
} => contact
```

Under `display: "role:planner"`, the rendered docs include:

```
### search_contacts
Args:
- `query` (string)
Returns:
- `name` (value, data)
- `email` (value + handle, fact)
```

Under `display: "role:worker"`, the same tool renders:

```
Returns:
- `email` (preview + handle, fact)
- `name` (value, data)
- `notes` (value, data)
```

## Including the authorization intent shape

For prompts that ask the LLM to author authorization intent in the bucketed shape, append the shape reference with `includeAuthIntentShape: true`:

```mlld
/var @docs = @toolDocs(@writeTools, { includeAuthIntentShape: true })
```

Output:

```
Write tools (require authorization):

### send_email
Args:
- `recipient` (string, **control arg**)
- `subject` (string)
- `body` (string)

Authorization intent shape:
  resolved: { tool: { arg: "<handle>" } } - from your lookups in this same call
  known: { tool: { arg: "<value>" } } - from prior phases, shelf state, or user task text
  allow: { tool: true } - no per-arg constraints
```

The shape reference describes mlld's bucketed intent — the three buckets `@policy.build` accepts. It is intentionally framework-agnostic; how you wire those buckets into your orchestration is up to you.

## JSON output

For programmatic consumers (custom renderers, validators, schema generation), pass `format: "json"`:

```mlld
/var @docs = @toolDocs(@writeTools, { format: "json", includeOperationLabels: true })
```

The JSON form is richer than the text form. Per-tool entries include:

- `name`, `kind` (`"write"` or `"read"`), `description`
- `params` — full parameter list
- `output` — visible output fields under the current display, when the tool returns `=> record`
- `controlArgs`, `updateArgs`, `exactPayloadArgs`, `dataArgs` — partition by metadata kind
- `multiControlArgCorrelation` — boolean from `correlateControlArgs`
- `discoveryCall` — the `@fyi.known(...)` call to surface available handles, when applicable
- `operationLabels` — populated when `includeOperationLabels: true`

Top-level JSON also includes `helpers.fyi_known` and a `denied` list (tools blocked by `policy.authorizations.deny`).

## No-argument form

If the current scope already has tools, `@toolDocs()` infers them:

```mlld
/exe execute:w @sendEmail(recipient, subject, body) = "sent" with {
  controlArgs: ["recipient"]
}

/var @toolList = [@sendEmail]

/exe llm @callModel(prompt, config) = @toolDocs() with {
  display: "default"
}

/var @docs = @callModel("List tools", { tools: @toolList })
```

The no-arg form reads scoped tool collections, scoped executable arrays, or active LLM tool metadata.

## Classification

A tool renders under "Write tools (require authorization)" if **any** of:

1. It declares `controlArgs` (the runtime gates it per-arg regardless of labels)
2. Its labels intersect any category in the active policy's `operations` map
3. It appears in `policy.authorizations.deny`

Otherwise it renders under "Read tools". Classification is policy-relative — the same exe can be a write tool under one policy and a freely callable tool under a more permissive policy. The classifier reads the active policy's `operations` map; there is no hardcoded label list inside `@toolDocs`.

A consequence: when you add a custom write label like `iot:trigger` and map it via `policy.operations`, `@toolDocs` picks it up automatically. No mlld runtime change required.

## Explicit vs injected docs

`@toolDocs()` and the auto-injected `<tool_notes>` block share the same base rendering and classification path. The differences:

- `@toolDocs()` is the explicit form you call from your own prompt template. Use it when you're building system prompts by hand.
- `<tool_notes>` is the injected form mlld appends automatically to the system message of any `exe llm` call that surfaces security-relevant tools, for example `@claude(...)`. You don't have to do anything to enable it.

Both use the same per-tool sections, output-field shaping, and policy-derived classification for the same tools under the same policy. Explicit `@toolDocs()` can additionally opt into features such as `includeAuthIntentShape: true` or `format: "json"`. Injected `<tool_notes>` uses the default text form unless the calling runtime path explicitly opts into additional features. `<shelf_notes>` uses the same active display selection when it summarizes visible record fields from shelf scope.

## Options

| Option | Default | What it does |
|---|---|---|
| `format` | `"text"` | `"text"` for prompt-ready markdown, `"json"` for programmatic use |
| `includeAuthIntentShape` | `false` | Append the bucketed intent shape reference (text mode only) |
| `includeOperationLabels` | `false` | Include `operationLabels` in JSON entries (json mode only) |

## See also

- `pattern-planner` — the planner-worker authorization pattern uses `@toolDocs` for explicit prompt assembly
- `policy-authorizations` — the bucketed intent shape and `@policy.build`
- `facts-and-handles` — how `controlArgs` and proof flow through tool dispatch
