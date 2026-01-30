---
id: pattern-router
title: Router Pattern
brief: Score and route to different handlers
category: patterns
parent: patterns
tags: [patterns, routing, scoring, handlers]
related: [when-first, for-block]
related-code: []
updated: 2026-01-05
---

```mlld
exe @router(message, handlers) = [
  let @scores = for @h in @handlers => {
    handler: @h.name,
    score: @h.scorer(@message)
  }
  let @best = @scores | @sortBy("score") | @first
  => when [
    @best.score > 0.7 => @handlers[@best.handler].handle(@message)
    * => null
  ]
]
```
