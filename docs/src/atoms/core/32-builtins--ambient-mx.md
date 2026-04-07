---
id: builtins-ambient-mx
qa_tier: 1
title: Ambient @mx Accessors
brief: Runtime-scoped debugging accessors under @mx.*
category: core
parent: builtins
tags: [builtins, mx, debugging, tracing, shelf, policy]
related: [builtins-reserved-variables, runtime-tracing, security-guards-basics, shelf-slots, facts-and-handles]
related-code: [interpreter/env/Environment.ts, interpreter/env/VariableManager.ts, interpreter/env/ContextManager.ts]
updated: 2026-04-07
---

`@mx` is ambient runtime state. It is different from `@someValue.mx`, which is metadata attached to a specific value.

Use `@mx.*` when you want to inspect the current execution context:

- `@mx.llm.config`, `@mx.llm.allowed`, `@mx.llm.native`, `@mx.llm.inBox`
- `@mx.llm.sessionId`
- `@mx.llm.display`
- `@mx.llm.resume`
- `@mx.handles`
- `@mx.shelf.writable`
- `@mx.shelf.readable`
- `@mx.policy.active`

## Handle introspection

`@mx.handles` returns the handles visible in the current LLM bridge session. The accessor is scope-filtered on read, so sibling calls do not see each other's handles.

```mlld
/show @mx.handles
```

Example shape:

```json
{
  "h_a7x9k2": {
    "value": "alice@example.com",
    "labels": ["fact:@contact.email"],
    "factsource": {
      "sourceRef": "@contact",
      "field": "email",
      "instanceKey": "c1"
    },
    "issuedAt": "2026-04-07T11:23:45.123Z"
  }
}
```

`value` is a debug preview, not a guaranteed full-content dump.

## LLM call metadata

`@mx.llm.sessionId` is the current bridge call session id, or `null` when no LLM call is active.

`@mx.llm.display` is the active display mode for the current call, or `null`.

`@mx.llm.resume` is `null` outside resumed calls. During resume it exposes:

```json
{
  "sessionId": "resume-session",
  "provider": "openai",
  "continuationOf": "resume-session",
  "attempt": 2
}
```

## Shelf scope metadata

`@mx.shelf.writable` and `@mx.shelf.readable` expose the current shelf scope as structured metadata:

```json
[
  {
    "alias": "selected",
    "slotRef": "@s.selected",
    "recordType": "@contact",
    "merge": "replace"
  }
]
```

These accessors report scope metadata only. Use `@shelf.read(@slotRef)` when you need the slot contents.

## Active policies

`@mx.policy.active` returns structured descriptors for the policies active in the current context:

```json
[
  { "name": "base", "locked": true, "source": "base" },
  { "name": "audit", "locked": true, "source": "audit" }
]
```

`@mx.policy.activePolicies` remains available as the legacy string array. Prefer `@mx.policy.active` for debugging and tests.
