---
id: for-batch
title: Batch Pipelines
brief: Processing collected results with trailing pipeline
category: control-flow
parent: for
tags: [iteration, loops, pipelines]
related: [for-collection, pipelines-basics]
related-code: [interpreter/eval/for.ts]
updated: 2026-01-05
---

**Batch pipelines** (process collected results):

```mlld
var @total = for @n in [1,2,3,4] => @n => | @sum
var @sorted = for @item in @items => @process(@item) => | @sortBy("priority")
```
