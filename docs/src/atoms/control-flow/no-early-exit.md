---
id: no-early-exit
title: No Top-Level Early Exit
brief: Top-level flow uses when and flags; exe blocks can return
category: control-flow
tags: [design, patterns]
related: [if, when-simple]
updated: 2026-01-30
---

mlld has no top-level `return` or `exit`. Model outcomes with `when` and flags.

```mlld
>> Instead of early return, use conditional flow
var @check = @validate(@input)
when [
  @check.valid => @process(@input)
  !@check.valid => show `Error: @check.message`
]
```

Inside `exe` blocks, use `if` and `=>` for early return:

```mlld
exe @guard(input) = [
  if !@input [
    => { error: "missing" }
  ]
  => { ok: @input }
]
```
