---
id: no-early-exit
title: No Early Exit
brief: For loops and exe blocks cannot break early
category: control-flow
tags: [design, patterns, loops, control-flow]
related: [if, when, script-return, for-block, exe-blocks]
related-code: [interpreter/eval/exe/block-execution.ts, interpreter/eval/for.ts]
updated: 2026-02-16
qa_tier: 2
---

mlld has no `break` or `continue` for loops. Use conditional logic instead.

**For loops iterate all items:**

```mlld
>> Filter with conditional accumulation
exe @filter(items) = [
  let @results = []
  for @item in @items [
    when @item.valid => [
      let @results += [@item]
    ]
  ]
  => @results
]
```

**Exe blocks support return via `=>`:**

```mlld
exe @validate(input) = [
  if !@input [
    => { error: "missing" }
  ]
  => { ok: @input }
]
```

**Scripts support top-level return:**

Script-level `=> @value` terminates execution immediately. See script-return for details.

```mlld
if @found [
  => "early exit"
]
=> "fallback"
```

**Design principle:**

Loops model data transformation. Use `when` branches and accumulation (`let @var += value`) for conditional processing. For early termination of scripts or functions, use `=> @value`.
