---
id: while
qa_tier: 2
title: While Loops
brief: Bounded iteration with done/continue control
category: flow-control
tags: [iteration, loops]
related: [for-arrow]
related-code: [interpreter/eval/while.ts]
updated: 2026-01-05
---

Bounded iteration with `while`.

```mlld
exe @countdown(n) = when [
  @n <= 0 => done "finished"
  * => continue (@n - 1)
]

var @result = 5 | while(10) @countdown
```

**Control keywords:**
- `done @value` - Terminate, return value
- `done` - Terminate, return current state
- `continue @value` - Next iteration with new state
- `continue` - Next iteration with current state

**While context** (`@mx.while`):
- `iteration` - Current iteration (1-based)
- `limit` - Configured cap
- `active` - true when inside while

**Accumulator pattern** — build a collection over iterations:

```mlld
exe @collect(state) = [
  let @items = @state.items
  let @next = @fetchNext(@state.cursor)
  if !@next [
    done @items
  ]
  continue { items: @items.concat([@next.data]), cursor: @next.cursor }
]

var @all = { items: [], cursor: null } | while(50) @collect
```

**With pacing:**

```mlld
var @result = @initial | while(100, 1s) @processor  >> 1s between iterations
```
