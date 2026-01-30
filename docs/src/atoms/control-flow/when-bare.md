---
id: when-bare
title: When (Bare Form)
brief: First match wins without modifiers
category: control-flow
parent: when
tags: [conditionals, branching]
related: [when-simple, when-first]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
---

**Bare form** (default first-match):

```mlld
when [
  @score > 90 => show "Excellent!"
  @hasBonus => show "Bonus earned!"
  none => show "No matches"        >> runs only if nothing matched
]
```

Use multiple `if` blocks when you need several actions to run.
