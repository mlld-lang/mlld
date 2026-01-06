---
id: for-skip
title: Skip Keyword
brief: Dropping items from iteration results
category: control-flow
parent: for
tags: [iteration, loops, filtering]
related: [for-filter]
related-code: [interpreter/eval/for.ts]
updated: 2026-01-05
---

**Skip keyword** (drop items from results):

```mlld
var @filtered = for @x in @items => when [
  @x.valid => @x
  none => skip      >> omit this item from results
]

>> Equivalent to inline filter, but allows complex logic
var @processed = for @item in @data => when first [
  @item.type == "a" => @transformA(@item)
  @item.type == "b" => @transformB(@item)
  * => skip         >> unknown types dropped
]
```
