---
id: pattern-gate
title: Gate Pattern
brief: Validate or filter before proceeding
category: patterns
parent: patterns
tags: [patterns, validation, gates, filtering]
related: [exe-blocks, when-first]
related-code: []
updated: 2026-01-05
---

**Validate or filter before proceeding:**

```mlld
exe @gate(response, config) = [
  let @check = @validate(@response)
  => when first [
    !@config.required => { pass: true }
    @check.valid => { pass: true }
    * => { pass: false, reason: @check.error }
  ]
]
```
