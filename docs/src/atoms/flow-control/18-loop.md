---
id: loop
qa_tier: 2
title: Loop Blocks
brief: Block iteration with done/continue control
category: flow-control
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

`done` exits the loop, not the entire script. Execution continues with the next statement after the loop. To capture the exit value and act on it conditionally:

```mlld
var @result = loop(10) [
  let @count = (@input ?? 0) + 1
  when @count >= 3 => done @count
  continue @count
]
when @result => show "Loop returned: @result"
```

To halt execution entirely, use `bail`:

```mlld
loop(10) [
  when @mx.loop.iteration > 5 => bail "Too many iterations"
  continue
]
```

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
