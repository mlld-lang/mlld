---
id: mistake-var-in-parallel-block
title: Var in Parallel Block
brief: Parallel blocks can't write to outer scope
category: mistakes
parent: mistakes
tags: [mistakes, parallel, scope, blocks]
related: [for-parallel, exe-blocks]
related-code: []
updated: 2026-01-05
---

Parallel blocks can't write to outer scope. Use `let`.

```mlld
>> Wrong
var @total = 0
for parallel @x in @items [
  var @total += 1   >> outer scope write blocked
]

>> Correct
exe @countItems(items) = [
  let @results = for parallel @x in @items => 1
  => @results.length
]
```
