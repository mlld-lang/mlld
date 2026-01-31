---
id: when-inline
title: When Inline
brief: Single condition with inline action
category: control-flow
parent: when
tags: [conditionals, branching]
related: [when, if]
related-code: [interpreter/eval/when.ts, grammar/directives/when.peggy]
updated: 2026-01-31
qa_tier: 1
---

**Inline form:**

```mlld
when @isProd => show "Production mode"
when @score > 90 => show "Excellent!"
```
