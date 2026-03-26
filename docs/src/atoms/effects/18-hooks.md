---
id: hooks
qa_tier: 2
title: Hooks
brief: Lifecycle hooks for observability and transforms
category: effects
tags: [hooks, lifecycle, observability, before, after]
related: [exe-simple, guards-basics, append]
related-code: [interpreter/hooks/HookManager.ts, interpreter/hooks/HookRegistry.ts, grammar/directives/hook.peggy]
updated: 2026-02-20
---

`hook` registers user lifecycle hooks that run before or after operations. Hooks observe, transform, or log — they do not abort (use guards for that).

**Syntax:** `hook [<@name>] <before|after> <filter> = <body>`

```mlld
>> Named hook on a named operation (after)
hook @logger after op:named:review = [
  append `reviewed: @mx.op.name` to "audit.log"
]

>> Before hook on an operation type
hook before op:run = [
  log `running: @mx.op.name`
]

>> After hook with when body
hook @router after op:exe = when [
  @mx.op.name == "deploy" => log "deployed"
  * => log "other exe"
]
```

**Three filter types:**

| Filter | Example | Matches |
|--------|---------|---------|
| Named operation | `op:named:review` | Calls to that executable |
| Named operation + prefix | `op:named:review("src/")` | Calls where first arg starts with `"src/"` |
| Operation | `op:run`, `op:exe`, `op:var` | All operations of that type |
| Data label | `untrusted` | Operations with labeled inputs |

Supported operation filters: `op:var`, `op:run`, `op:exe`, `op:show`, `op:output`, `op:log`, `op:append`, `op:stream`, `op:for`, `op:for:iteration`, `op:for:batch`, `op:loop`, `op:import`.

`op:loop` fires per iteration (each call to `loop()`), not once for the whole `/loop` directive. `op:log` matches `/log` directives specifically (not `/output`).

**Hook body context:**

| Variable | Timing | Description |
|----------|--------|-------------|
| `@input` | both | Operation inputs (named-operation `before` hooks receive the argument array) |
| `@output` | `after` | Operation result |
| `@mx.op.name` | both | Operation or executable name |
| `@mx.op.type` | both | Operation type (`exe`, `run`, `show`, etc.) |
| `@mx.op.named` | named ops | Canonical named-op identity (`op:named:...`) |
| `@mx.op.labels` | both | Labels on the operation |
| `@mx.hooks.errors` | both | Errors from earlier hooks in the chain |

**Behavior:**
- Hooks run in declaration order
- Return values chain — a later hook receives the previous hook's transformed value
- Body errors are isolated and collected in `@mx.hooks.errors` (the parent operation continues)
- Hooks are non-reentrant — nested operations inside a hook body skip user hooks

```mlld
>> Observability: telemetry + error tracking
hook @telemetry after op:named:emit = [
  output `telemetry:@mx.op.name` to "state://telemetry"
]

hook @errors after op:named:emit = [
  append `errors:@mx.hooks.errors.length` to "hook-errors.log"
]
```

**Hooks vs guards:** Hooks observe and transform. Guards enforce security policy and can deny or retry operations. Use hooks for logging, telemetry, and light transforms. Use guards when you need to block operations based on labels or content.
