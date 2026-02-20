---
id: when-value-returning
title: Value-Returning When
brief: Using when in exe to return values
category: control-flow
parent: when
tags: [conditionals, exe, functions]
related: [when, exe-when, exe-simple]
related-code: [interpreter/eval/when.ts, interpreter/eval/exe.ts]
updated: 2026-01-31
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

`when` returns the first matching branch. Use `if` for imperative flow.

Inside `exe` block statements, `when` values also return from the enclosing `exe` on match:

```mlld
exe @guard(x) = [
  when !@x => [
    => "missing"
  ]
  => "ok"
]
```

Block form keeps return intent explicit. Bare value actions such as `when !@x => "missing"` are valid and return early, but `mlld validate` warns so intent stays clear.
