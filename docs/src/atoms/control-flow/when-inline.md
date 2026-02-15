---
id: when-inline
title: When Inline
brief: Single-expression shorthand for when
category: control-flow
parent: when
tags: [conditionals, branching]
related: [when, when-blocks, if]
related-code: [interpreter/eval/when.ts, grammar/directives/when.peggy]
updated: 2026-01-31
qa_tier: 1
---

Use inline `when` for a single action expression, such as
`when @score > 90 => show "Excellent!"`.

This matches the same condition semantics as block form:

```mlld
var @score = 95
when [
  @score > 90 => show "Excellent!"
  * => show "No match"
]
```

Use block form when you need multiple branches or a multi-statement action:

```mlld
when [
  @role == "admin" => show "Admin access"
  @role == "editor" => [
    let @message = "Editor access"
    show @message
  ]
  * => show "No access"
]
```
