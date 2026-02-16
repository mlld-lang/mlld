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

Match a value against patterns using `when @expr [patterns]`.

**Value matching** (literal patterns):

```mlld
var @status = "active"
when @status [
  "active" => show "Running"
  "pending" => show "Waiting"
  * => show "Unknown"
]
```

The colon form `when @expr: [patterns]` also works but the colon is optional.

**Condition matching** (boolean expressions):

```mlld
when @score [
  @score > 90 => show "A"
  @score > 80 => show "B"
  * => show "F"
]
```

Patterns evaluate in order. First match wins.

**Simple inline** (single action):

```mlld
when @cond => show "Match"
```

Use block form `when [@cond => action; * => default]` when you need multiple branches or a fallback.
