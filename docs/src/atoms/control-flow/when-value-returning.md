---
id: when-value-returning
title: Value-Returning When
brief: Using when in exe to return values
category: control-flow
parent: when
tags: [conditionals, exe, functions]
related: [when-first, exe-simple]
related-code: [interpreter/eval/when.ts, interpreter/eval/exe.ts]
updated: 2026-01-05
---

**Value-returning when** (in exe):

```mlld
exe @classify(score) = when [
  @score >= 90 => "A"
  @score >= 80 => "B"
  * => "F"
]

var @grade = @classify(85)  >> "B"
```
