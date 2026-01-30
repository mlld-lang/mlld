---
id: pattern-gate
title: Gate Pattern
brief: Validate or filter before proceeding
category: patterns
parent: patterns
tags: [patterns, validation, gating, filters]
related: [when-first, exe-blocks]
related-code: []
updated: 2026-01-05
---

```mlld
exe @gate(response, config) = [
  let @check = @validate(@response)
  => when [
    !@config.required => { pass: true }
    @check.valid => { pass: true }
    * => { pass: false, reason: @check.error }
  ]
]
```
