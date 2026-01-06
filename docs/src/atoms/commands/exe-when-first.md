---
id: exe-when-first
title: Exe When-First
brief: Value-returning conditionals in function bodies
category: commands
parent: exe
tags: [functions, conditionals, when, value-returning]
related: [exe-blocks, when-first, exe-simple]
related-code: [interpreter/eval/exe.ts, interpreter/eval/when.ts]
updated: 2026-01-05
---

**When-first in exe** (value-returning):

```mlld
exe @classify(score) = when first [
  @score >= 90 => "A"
  @score >= 80 => "B"
  @score >= 70 => "C"
  * => "F"
]

>> With blocks for side effects
exe @handler(input) = when first [
  @input.valid => [
    show "Processing..."
    let @result = @transform(@input)
    => @result
  ]
  * => { error: "Invalid input" }
]
```
