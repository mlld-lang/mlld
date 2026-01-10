---
id: no-early-exit
title: No Early Exit
brief: mlld has no return/exit - use when and flags
category: control-flow
tags: [design, patterns]
related: [when-first]
updated: 2026-01-05
---

mlld has no `return` or `exit`. Model outcomes with `when` and flags.

```mlld
>> Instead of early return, use conditional flow
var @check = @validate(@input)
when [
  @check.valid => @process(@input)
  !@check.valid => show `Error: @check.message`
]
```
