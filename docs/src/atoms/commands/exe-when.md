---
id: exe-when
title: Exe When
brief: Select the first matching branch in exe bodies
category: commands
parent: exe
tags: [functions, conditionals, when, value-returning]
related: [exe-blocks, when, exe-simple, if]
related-code: [interpreter/eval/exe.ts, interpreter/eval/when.ts]
updated: 2026-01-31
---

**When in exe** (first match wins):

```mlld
exe @classify(score) = when [
  @score >= 90 => "A"
  @score >= 80 => "B"
  * => "F"
]
```

Use `if` for imperative flow where multiple branches can run.
