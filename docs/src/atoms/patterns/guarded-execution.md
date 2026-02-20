---
id: pattern-guarded-execution
title: Guarded Execution Pattern
brief: Validate at each step before proceeding
category: patterns
parent: patterns
tags: [patterns, guards, validation, pipelines]
related: [pipelines-basics, when]
related-code: []
updated: 2026-01-05
---

```mlld
var @processed = @data | @validate | @normalize | @analyze

when [
  @processed.ok => @emitReport(@processed)
  !@processed.ok => show "Validation failed"
]
```
