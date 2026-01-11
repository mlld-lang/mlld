---
id: when-simple
title: When Simple
brief: Basic conditional with single condition
category: control-flow
parent: when
tags: [conditionals, branching]
related: [when-bare, when-first]
related-code: [interpreter/eval/when.ts, grammar/patterns/when.peggy]
updated: 2026-01-05
qa_tier: 1
---

**Simple form:**

```mlld
when @isProd => show "Production mode"
when @score > 90 => show "Excellent!"
```
