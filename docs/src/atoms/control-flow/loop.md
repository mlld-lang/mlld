---
id: loop
title: Loop Blocks
brief: Block iteration with done/continue control
category: control-flow
tags: [iteration, loops]
related: [while]
related-code: [interpreter/eval/loop.ts]
updated: 2026-01-05
---

Block-based iteration with explicit `done` and `continue`.

```mlld
var @result = loop(10) [
  let @count = (@input ?? 0) + 1
  when @count >= 3 => done @count
  continue @count
]
```

**Control keywords:**
- `done @value` - Exit loop and return value
- `done` - Exit loop and return null
- `continue @value` - Next iteration with new `@input`
- `continue` - Next iteration with unchanged `@input`

`@input` starts as null and updates only via `continue @value`.

**Loop context** (`@mx.loop`):
- `iteration` - Current iteration (1-based)
- `limit` - Configured cap or null for endless
- `active` - true when inside loop

**Until clause:**

```mlld
loop until @input >= 3 [
  let @next = (@input ?? 0) + 1
  show `@next`
  continue @next
]
```

**With pacing:**

```mlld
loop(endless, 10ms) until @input >= 3 [
  let @next = (@input ?? 0) + 1
  show "poll"
  continue @next
]
```
