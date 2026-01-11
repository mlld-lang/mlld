---
id: when-blocks
title: Block Actions in When
brief: Side effects and return with block syntax
category: control-flow
parent: when
tags: [conditionals, blocks]
related: [when-first, exe-block]
related-code: [interpreter/eval/when.ts, interpreter/eval/block.ts]
updated: 2026-01-05
qa_tier: 2
---

**Block actions** (side effects + return):

```mlld
var @result = when first [
  @needsProcessing => [
    show "Processing..."
    let @processed = @transform(@data)
    => @processed
  ]
  * => @data
]
```
