---
id: when
title: When
brief: Select the first matching branch
category: control-flow
tags: [conditionals, branching]
related: [when-inline, when-blocks, if]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-31
---

**When block** (first match wins):

```mlld
when [
  @score > 90 => show "Excellent!"
  @hasBonus => show "Bonus earned!"
  none => show "No matches"        >> runs only if nothing matched
]
```

Use multiple `if` blocks when you need several actions to run.

Inline form uses `when @cond => action`.
