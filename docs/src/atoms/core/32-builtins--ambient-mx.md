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
updated: 2026-04-12
---

`@mx` is ambient runtime state. It is different from `@someValue.mx`, which is metadata attached to a specific value.

Use `@mx.*` when you want to inspect the current execution context:

- `@mx.llm.config`, `@mx.llm.allowed`, `@mx.llm.native`, `@mx.llm.inBox`
- `@mx.llm.sessionId`
- `@mx.llm.display`
- `@mx.llm.resume`
- `@mx.handles`
- `@mx.handles.unfiltered`
- `@mx.shelf.writable`
- `@mx.shelf.readable`
- `@mx.policy.active`

## Handle introspection

`@mx.handles` returns the handles visible in the current LLM bridge session, grouped by record instance. The accessor is scope-filtered on read, so sibling calls do not see each other's handles. The active display mode shapes which fields appear; `@mx.handles.unfiltered` exposes the full grouped view.

```mlld
/show @mx.handles
/show @mx.handles.unfiltered
```

Example shape:

```json
[
  {
    "record": "@contact",
    "instance": {
      "email": {
        "value": "alice@example.com",
        "handle": "h_a7x9k2"
      },
      "name": {
        "value": "Alice",
        "handle": "h_k91m4p"
      }
    }
  }
]
```

For masked fields, the grouped view uses `{ preview, handle }`. For handle-only fields, the grouped view stores just the handle string. `@mx.handles.unfiltered` always uses `{ value, handle }` for every available field.

## Value-local handle accessors

`@someValue.mx` is per-value metadata. Two handle-specific accessors are now available there:

- `.mx.handle` returns the stable handle for that single value inside the current LLM bridge call, or `null` outside a bridge call.
- `.mx.handles` returns the display-shaped handle view for a structured record value.

```mlld
/show @contact.email.mx.handle
/show @contact.mx.handles
```

Example `.mx.handles` shape for a `role:planner` display:

```json
{
  "subject": { "value": "Update", "handle": "h_1a2b3c" },
  "from": { "value": "ada@example.com", "handle": "h_4d5e6f" },
  "message_id": "h_7g8h9i"
}
```

Outside an active bridge call, the same accessor returns the same shape with `handle: null` or `null` handle-only entries. This makes tests and debug code deterministic without minting live handles when no resolver scope exists.

## LLM call metadata

`@mx.llm.sessionId` is the current bridge call session id, or `null` when no LLM call is active.

This is bridge or provider metadata, not `var session` state. Session-scoped state is read through its declared accessor name:

```mlld
var session @planner = {
  count: number?
}

show @mx.llm.sessionId
show @planner.count
```

For values returned by `exe llm`, session metadata can also appear on the returned value itself. Provider session metadata stays at `@someValue.mx.sessionId` when the runtime envelope includes it. When the call attached `var session` state, the final committed snapshot is exposed separately at `@someValue.mx.sessions.<name>`:

```mlld
let @result = @claude("Review this file", { model: "sonnet" })
show @result.mx.sessionId
show @result.mx.sessions.planner
```

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
