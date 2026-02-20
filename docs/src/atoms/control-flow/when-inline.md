---
id: when-inline
title: When Match Form
brief: Pattern matching with optional colon syntax
category: control-flow
parent: when
tags: [conditionals, pattern-matching]
related: [when, when-blocks, when-value-returning]
related-code: [interpreter/eval/when.ts, grammar/directives/when.peggy]
updated: 2026-02-16
qa_tier: 1
---

Two forms: value matching (`when @expr [patterns]`) and condition matching (`when [conditions]`).

**Value matching** — match a value against literal patterns:

```mlld
var @status = "active"
when @status [
  "active" => show "Running"
  "pending" => show "Waiting"
  * => show "Unknown"
]
```

The colon form `when @expr: [patterns]` also works but the colon is optional.

**Condition matching** — evaluate boolean expressions (no value after `when`):

```mlld
when [
  @score > 90 => show "A"
  @score > 80 => show "B"
  * => show "F"
]
```

Patterns evaluate in order. First match wins.

**Simple inline** (single condition, single result):

```mlld
when @cond => show "Match"
```

Returns the result when the condition is truthy. Use block form `when [@cond => action; * => default]` when you need multiple branches or a fallback.
