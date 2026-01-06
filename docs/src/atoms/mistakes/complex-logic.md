---
id: mistake-complex-logic
title: Complex Logic Inline
brief: Extract heavy logic to helpers or modules
category: mistakes
parent: mistakes
tags: [mistakes, complexity, helpers, modules]
related: [exe-blocks, modules-philosophy]
related-code: []
updated: 2026-01-05
---

**Move heavy logic to helpers or modules. Keep orchestration simple:**

```mlld
>> Wrong (too much logic inline)
var @result = for @item in @items => when first [
  @item.type == "a" && @item.status == "active" => [
    let @x = @item.value * 2
    let @y = @transform(@x)
    let @z = @validate(@y)
    => when [ @z.ok => @z.value * => null ]
  ]
  * => null
]

>> Correct (extract to helper)
exe @processItem(item) = [
  let @x = @item.value * 2
  let @y = @transform(@x)
  let @z = @validate(@y)
  => when [ @z.ok => @z.value * => null ]
]

var @result = for @item in @items when @item.type == "a" => @processItem(@item)
```
