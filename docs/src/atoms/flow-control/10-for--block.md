---
id: for-block
title: For Block Form
brief: Multi-statement iteration bodies
category: control-flow
parent: for
tags: [iteration, loops, blocks]
related: [for-arrow, for-collection]
related-code: [interpreter/eval/for.ts, interpreter/eval/block.ts]
updated: 2026-01-05
qa_tier: 2
---

**Block form:**

```mlld
for @item in @items [
  let @processed = @transform(@item)
  show `Done: @processed`
]

>> Collection with block
var @results = for @item in @items [
  let @step1 = @validate(@item)
  let @step2 = @transform(@step1)
  => @step2
]
```
