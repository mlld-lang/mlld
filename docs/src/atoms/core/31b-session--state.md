---
id: session-state
title: Session-Scoped State
brief: Typed per-call mutable state for LLM bridge frames and tool callbacks
category: core
parent: sessions
tags: [session, state, llm, tools, agents]
related: [llm-modules, builtins-ambient-mx, runtime-tracing, shelf-slots]
related-code: [core/types/session.ts, interpreter/session/runtime.ts, interpreter/eval/exec-invocation.ts]
updated: 2026-04-20
qa_tier: 2
---

`var session` declares typed mutable state that is attached to one LLM bridge frame. It is the runtime state surface for a single planner or worker call, not a general-purpose variable and not provider conversation metadata.

## Declare a session schema

```mlld
var session @planner = {
  query: string,
  count: number?,
  previous_count: number?,
  trail: string[]?
}
```

Each slot has a declared type. Supported primitives are `string`, `number`, `boolean`, `object`, and `array`. Record-backed slots use `@record` or `@record[]`.

Session slot records must be input-capable, use open display, and must not declare `when` rules.

## Attach a session to a call

```mlld
var session @planner = {
  query: string,
  count: number?,
  previous_count: number?,
  trail: string[]?
}

exe llm @agent(prompt, config) = js {
  return "ok"
}

show @agent("Plan the work", {}) with {
  session: @planner,
  seed: {
    query: "Plan the work",
    count: 0,
    trail: []
  }
}
```

`seed` initializes slots for the attached frame before the first read. Required slots must be seeded.

## Read semantics

Inside the attached frame, named accessors such as `@planner.count` read the live slot value.

Bare-name reads are different:

```mlld
let @snapshot = @planner
```

That materializes a snapshot object of the current frame state. Later writes to `@planner.*` do not mutate `@snapshot`.

Resolution is strict and local:

- `@planner.count` resolves only against the nearest attached frame for `@planner`
- inner calls do not walk outward looking for another frame with the same name
- if the current frame is not attached, reads and writes fail

## Slot operations

Session accessors expose write helpers:

```mlld
exe @plusOne(value) = js {
  return (value ?? 0) + 1
}

exe tool:w @track() = [
  @planner.increment("count")
  @planner.update("count", @plusOne)
  let @snapshot = @planner
  @planner.set({ previous_count: @snapshot.count })
  @planner.append("trail", "tracked")
  @planner.clear("trail")
  => @planner.count
]
```

Available operations:

- `@planner.set({ slot: value, ... })`
- `@planner.append("slot", value)`
- `@planner.increment("slot", delta?)`
- `@planner.clear("slot")`
- `@planner.update("slot", @updater)`

`.update` only accepts pure local updaters. Use local `js`, `node`, or pure mlld data-style executables. `exe llm` and tool-dispatching executables are rejected.

## Wrapper-owned defaults

An LLM wrapper can attach its own default session:

```mlld
var session @defaultPlanner = {
  count: number?
}

exe llm @agent(prompt, config) = js {
  return "ok"
} with {
  session: @defaultPlanner,
  seed: { count: 0 }
}
```

That default belongs to the wrapper. A caller can replace it only with:

```mlld
var session @callerPlanner = {
  count: number?
}

show @agent("hello", {}) with {
  session: @callerPlanner,
  override: "session"
}
```

Without `override: "session"`, a conflicting caller session is rejected.
