---
id: fyi-known
title: Handle Discovery (Known)
brief: Registry-backed handle discovery via @fyi.known()
category: effects
tags: [fyi, facts, handles, discovery, agents, security]
related: [labels-facts, records-basics, facts-and-handles, pattern-planner, policy-authorizations]
related-code: [interpreter/fyi/facts-runtime.ts, interpreter/env/ValueHandleRegistry.ts, core/policy/fact-requirements.ts]
updated: 2026-04-15
---

The primary handle path is still display projections on record-coerced tool results. Agents get handles directly in the data they fetch. See `records-basics` and `facts-and-handles`.

`@fyi.known()` is the unified discovery surface for cases where the handle already exists in the runtime registry but is not sitting in the current tool result: prior read-phase tool calls, planner-minted `known` approvals, or other proof-bearing values already registered in the execution.

## When to use it

- The worker needs handles for a write tool's control args
- The worker needs handles for a read/extract tool's surfaced source args
- A planner or earlier phase already registered proof-bearing values
- The current step needs to browse matching candidates instead of copying a handle from the latest tool result

For the common "call a read tool and immediately reuse the returned handle" flow, `@fyi.known()` is not needed.

## Call shapes

From MCP:

```json
{ "name": "known", "arguments": {} }
```

```json
{ "name": "known", "arguments": { "query": "sendEmail" } }
```

```json
{ "name": "known", "arguments": { "query": { "op": "sendEmail", "arg": "recipient" } } }
```

From mlld: `@fyi.known()`, `@fyi.known("sendEmail")`, or `@fyi.known({ op: "sendEmail", arg: "recipient" })`.

## Response shape

No-arg discovery returns every proof-bearing handle in the registry:

```json
[
  { "handle": "h_a7x9k2", "label": "Mark Davies", "field": "email", "fact": "fact:@contact.email" },
  { "handle": "h_b3m8q1", "label": "john@example.com", "proof": "known" }
]
```

Operation-aware discovery returns candidates grouped by control arg or source arg:

```json
{
  "recipient": [
    { "handle": "h_a7x9k2", "label": "Mark Davies", "field": "email", "fact": "fact:@contact.email" },
    { "handle": "h_b3m8q1", "label": "john@example.com", "proof": "known" }
  ]
}
```

Fact-backed candidates carry `fact`. Planner-attested candidates carry `proof: "known"`. Both return opaque handles and safe labels. The reusable value is the handle.

## What is searchable

`@fyi.known()` queries the root-scoped handle registry. That registry contains:

- Fact-bearing values from display projections on record-coerced tool results
- `known`-attested values minted by `@policy.build`
- Existing fact-backed handles reused by `@policy.build` when a `known` value exactly matches a prior tool result

There is no separate root list to configure. If the handle exists in the execution registry and satisfies the operation's fact requirements, it can be discovered.

## Filtering

`@fyi.known("send_email")` uses the fact requirement resolver to filter candidates. For `send_email`, only values that satisfy the destination requirement for each control arg are returned. For read/extract tools, discovery groups candidates under the surfaced source-arg names and returns fact-bearing handles plus matching `known` handles. If the resolver cannot determine requirements for an `(op, arg)` pair, discovery returns nothing for that position.

This keeps discovery aligned with the same requirement model used by positive checks and runtime enforcement.

## Availability

`@fyi.known()` is implicitly available to LLMs that receive tools with effective control args or source args. On record-backed tool catalogs, those come from input-record `facts`. Workers need a way to discover handles for those security-relevant arguments, so the runtime injects the tool automatically on the MCP bridge.

The planner does NOT call `@fyi.known()`. The planner shapes authorization intent from its own tool calls and the user's task. The worker discovers handles later via `@fyi.known()`. See `pattern-planner` for the full flow.
