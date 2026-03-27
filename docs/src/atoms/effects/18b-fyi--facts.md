---
id: fyi-facts
title: Fact Discovery (Explicit)
brief: Explicit cross-root fact discovery via @fyi.facts() -- secondary to display projections
category: effects
tags: [fyi, facts, handles, discovery, agents, security]
related: [labels-facts, records-basics, facts-and-handles, pattern-planner, policy-authorizations]
related-code: [interpreter/fyi/facts-runtime.ts, interpreter/fyi/config.ts, core/policy/fact-requirements.ts]
updated: 2026-03-26
---

The primary handle path is display projections on record-coerced tool results. Agents get handles directly in the data they fetch. See `records-basics` and `facts-and-handles`.

`@fyi.facts()` is the explicit discovery surface for cases where projected tool results are not enough -- cross-source browsing, querying without a prior tool call, or compatibility with non-projected flows.

## When to use it

- The agent needs to browse fact candidates across multiple prior tool results
- The orchestrator configured explicit roots and the agent needs to query them
- Projected tool results aren't available (non-record-coerced tools, compatibility paths)

For the common planner flow (call a tool, get projected results with handles, copy the handle into authorization), `@fyi.facts()` is not needed.

## Call shapes

From MCP:

```json
{ "name": "fyi.facts", "arguments": { "query": "sendEmail" } }
```

```json
{ "name": "fyi.facts", "arguments": { "query": { "op": "sendEmail", "arg": "recipient" } } }
```

```json
{ "name": "fyi.facts", "arguments": {} }
```

From mlld: `@fyi.facts("sendEmail")`, `@fyi.facts({ op: "sendEmail", arg: "recipient" })`, or `@fyi.facts()`.

## Response shape

```json
[
  { "handle": "h_a7x9k2", "label": "Mark Davies", "field": "email", "fact": "fact:external:@contact.email" }
]
```

Labels are safe display text (sibling fields or masked fallbacks), not raw values. The reusable value is the handle -- unlike projected tool results, `@fyi.facts()` labels are not tolerant input aliases.

## Configuring roots

```mlld
var @cfg = { fyi: { facts: [@contacts, @task] } }
```

`fyi.facts` on a box or call site declares which values are searchable. `facts: "auto"` auto-registers tool results from the session.

## Requirement sources

Filtered discovery derives requirements from built-in symbolic specs, live operation metadata, and declarative `policy.facts.requirements`. If none resolve, discovery returns nothing.
