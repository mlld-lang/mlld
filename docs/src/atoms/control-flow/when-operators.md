---
id: when-operators
title: Operators in When Conditions
brief: Comparison and logical operators
category: control-flow
parent: when
tags: [conditionals, operators]
related: [when, when-inline]
related-code: [grammar/patterns/operators.peggy]
updated: 2026-01-31
qa_tier: 2
---

**Operators in conditions:**
- Comparison: `<`, `>`, `<=`, `>=`, `==`, `!=`
- Logical: `&&`, `||`, `!`
- Parentheses: `(@a || @b) && @c`

```mlld
when [
  @role == "admin" || @role == "mod" => show "Privileged"
  @active && @verified => show "Active user"
  !@banned => show "Allowed"
  * => show "Blocked"
]
```
