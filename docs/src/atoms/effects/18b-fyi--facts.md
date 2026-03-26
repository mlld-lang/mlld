---
id: fyi-facts
title: Fact Discovery
brief: Discover fact candidates with opaque handles via @fyi.facts()
category: effects
tags: [fyi, facts, handles, discovery, agents, security]
related: [labels-facts, records-basics, facts-and-handles, pattern-planner, policy-authorizations]
related-code: [interpreter/fyi/facts-runtime.ts, interpreter/fyi/config.ts, interpreter/env/ValueHandleRegistry.ts, core/policy/fact-requirements.ts]
updated: 2026-03-25
qa_tier: 2
---

The primary planner workflow uses projected record results with embedded handles. `@fyi.facts()` remains the explicit discovery surface for agents that need to search configured roots directly.

`@fyi` is a tool given to agents -- including via MCP. When `fyi: { facts: ... }` is configured on a box or call site, the `@fyi` tool is implicitly available to the LLM inside that scope.

## How the agent calls it

`@fyi.facts` takes a single `query` parameter. From the agent's perspective (MCP tool call):

**No-arg exploration** -- all fact candidates from configured roots:

```json
{ "name": "fyi.facts", "arguments": {} }
```

**By operation** -- all fact-relevant args for an operation, grouped by arg name:

```json
{ "name": "fyi.facts", "arguments": { "query": "sendEmail" } }
```

**By operation and arg** -- narrow to one specific arg:

```json
{ "name": "fyi.facts", "arguments": { "query": { "op": "sendEmail", "arg": "recipient" } } }
```

The query accepts a bare operation name (`"sendEmail"`), a canonical ref (`"op:named:email.send"`), or an object with `op` and optional `arg`.

In mlld syntax: `@fyi.facts()`, `@fyi.facts("sendEmail")`, or `@fyi.facts({ op: "sendEmail", arg: "recipient" })`.

## Setting up roots

```mlld
record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?]
}

exe @getContacts(query) = run cmd {
  contacts-cli search @query --format json
} => contact

var @contacts = @getContacts("Mark")
var @cfg = { fyi: { facts: [@contacts] } }
```

Inside a box or call-site scoped with that config, `@fyi.facts()` searches the configured roots.

## Response shape

Each candidate has four fields:

```json
[
  { "handle": "h_a7x9k2", "label": "Mark Davies", "field": "email", "fact": "fact:external:@contact.email" },
  { "handle": "h_m3q8t1", "label": "a***@example.com", "field": "email", "fact": "fact:@contact.email" }
]
```

| Field | What it is |
|---|---|
| `handle` | Opaque reference to the live value (e.g., `h_a7x9k2`) |
| `label` | Safe display text -- sibling field (like `name`) or masked fallback |
| `field` | Record field name |
| `fact` | The fact label on the value |

The raw authorization-critical value (the actual email address) is not exposed. The LLM chooses from candidates by label, then returns the handle.

## Configuring roots

### Auto mode

`facts: "auto"` uses successful native tool results from the current scoped session as discovery roots automatically:

```mlld
var @cfg = { fyi: { facts: "auto" } }
```

When an agent calls a tool that returns a record-coerced value, that result is auto-registered as a discovery root. A later `@fyi.facts()` call in the same session can surface handles from it without the orchestrator listing roots explicitly.

This is a compatibility path, not the primary planner workflow. If the projected tool result already contains the needed handle, the agent can copy that handle directly and skip `@fyi.facts()`.

This is the typical explicit-discovery configuration -- the agent discovers facts from whatever data it retrieves during its session when projected tool results alone are not enough.

### Explicit roots

List specific values to make them discoverable:

```mlld
var @contacts = @getContacts("Mark")
var @task = @getTask("123")
var @cfg = { fyi: { facts: [@contacts, @task] } }
```

Only values listed in `fyi.facts` are eligible. Call-site config overrides box-level defaults.

### Combining both

```mlld
var @cfg = { fyi: { facts: ["auto", @contacts] } }
```

Auto-collected tool results plus any explicit roots you provide.

## Using handles

The LLM returns a handle instead of a literal:

```json
{ "recipient": { "handle": "h_a7x9k2" } }
```

The runtime resolves `h_a7x9k2` back to the original live value with its fact labels intact. This is how proof survives the LLM boundary.

If the LLM returns a raw literal instead of a handle, the literal has no proof. Positive checks fail closed.

See `facts-and-handles` for the full security model. See `pattern-planner` for using handles in planner-worker authorization.

## Requirement sources

Filtered discovery derives requirements from three sources:

1. **Built-in symbolic specs** -- `op:named:email.send` requires `fact:*.email` on destination args
2. **Live operation metadata** -- `labels` and `controlArgs` from the exe definition
3. **Declarative policy** -- `policy.facts.requirements` entries

If none resolve for a given `(op, arg)`, discovery returns nothing. It never infers requirements from arg names alone.

## Handles are execution-scoped

Handles are:

- Opaque -- format is not meaningful to consumers
- Execution-scoped -- valid only within the current execution
- Runtime-issued -- minted by the runtime, not by user code

They are not stable IDs and should not be persisted or shared across executions.
