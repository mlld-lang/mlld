---
id: when-blocks
title: Block Actions in When
brief: Side effects and return with block syntax
category: control-flow
parent: when
tags: [conditionals, blocks]
related: [when, exe-blocks, if]
related-code: [interpreter/eval/when.ts, interpreter/eval/block.ts]
updated: 2026-01-31
qa_tier: 2
---

**Block actions** (side effects + return):

```mlld
var @result = when [
  @needsProcessing => [
    show "Processing..."
    let @processed = @transform(@data)
    => @processed
  ]
  * => @data
]
```

Conditions evaluate in order and the first match runs.
