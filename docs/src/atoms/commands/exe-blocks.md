---
id: exe-blocks
title: Exe Block Syntax
brief: Multi-statement function bodies
category: commands
parent: exe
tags: [functions, blocks, let, accumulation]
related: [exe-simple, exe-when-first, for-block]
related-code: [interpreter/eval/exe.ts, interpreter/eval/block.ts]
updated: 2026-01-05
---

**Block syntax** (multi-statement bodies):

```mlld
exe @process(data) = [
  let @validated = @validate(@data)
  let @transformed = @transform(@validated)
  => @transformed
]

>> With accumulation
exe @countItems(items) = [
  let @count = 0
  for @item in @items [
    let @count += 1
  ]
  => @count
]
```

Block rules:
- Use `[...]` for multi-statement bodies
- `let @var = value` for block-scoped variables
- `let @var += value` for accumulation (arrays/strings/objects)
- `=> value` required as last statement for return
