---
id: exe-blocks
title: Exe Block Syntax
brief: Multi-statement function bodies
category: core
parent: exe
tags: [functions, blocks, let, accumulation]
related: [exe-simple, exe-when, for-block, script-return, exe-tool-return]
related-code: [interpreter/eval/exe.ts, interpreter/eval/block.ts]
updated: 2026-04-09
qa_tier: 2
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
- `=> value` terminates the block and returns from the exe (see `script-return`)
- `-> value` writes the LLM-facing tool slot without terminating; `=-> value` writes both slots and terminates (see `exe-tool-return`)
- When using both `=>` and `->`, `->` must come before `=>` — `->` is a passive write that continues execution, `=>` terminates the block
