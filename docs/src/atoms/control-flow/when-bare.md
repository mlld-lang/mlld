---
id: when-bare
title: When Bare (All Matches)
brief: Evaluates all matching conditions
category: control-flow
parent: when
tags: [conditionals, branching]
related: [when-simple, when-first]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
---

**Bare form** (evaluates all matching conditions):

```mlld
when [
  @score > 90 => show "Excellent!"
  @hasBonus => show "Bonus earned!"
  none => show "No matches"        >> runs only if nothing matched
]
```
