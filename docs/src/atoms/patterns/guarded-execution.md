---
id: pattern-guarded-execution
title: Guarded Execution Pattern
brief: Validate at each step before proceeding
category: patterns
parent: patterns
tags: [patterns, validation, guards, safety]
related: [pipelines-basics, when-simple]
related-code: []
updated: 2026-01-05
---

**Validate at each step before proceeding:**

```mlld
var @processed = @data | @validate | @normalize | @analyze

when [
  @processed.ok => @emitReport(@processed)
  !@processed.ok => show "Validation failed"
]
```
