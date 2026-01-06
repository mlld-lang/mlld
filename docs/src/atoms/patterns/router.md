---
id: pattern-router
title: Router Pattern
brief: Score and route to different handlers
category: patterns
parent: patterns
tags: [patterns, routing, scoring, handlers]
related: [exe-blocks, when-first, for-block]
related-code: []
updated: 2026-01-05
---

**Score and route to different handlers:**

```mlld
exe @router(message, handlers) = [
  let @scores = for @h in @handlers => {
    handler: @h.name,
    score: @h.scorer(@message)
  }
  let @best = @scores | @sortBy("score") | @first
  => when first [
    @best.score > 0.7 => @handlers[@best.handler].handle(@message)
    * => null
  ]
]
```
