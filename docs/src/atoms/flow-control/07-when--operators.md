---
id: when-operators
title: Operators in When Conditions
brief: Comparison and logical operators
category: flow-control
parent: when
tags: [conditionals, operators]
related: [when, when-inline, if]
related-code: [grammar/patterns/operators.peggy, interpreter/eval/expressions.ts]
updated: 2026-03-16
qa_tier: 2
---

**Operators in conditions:**
- Comparison: `<`, `>`, `<=`, `>=`, `==`, `!=`, `~=`, `!~=`
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

**Tolerant comparison (`~=`):**

Use `~=` when the left side is LLM-produced or otherwise format-unstable. It keeps strict `==` available, but tolerates common representation drift:

- String ↔ single-element array: `"alice@example.com" ~= ["alice@example.com"]`
- Order-independent arrays: `["b", "a"] ~= ["a", "b"]`
- Subset matching for arrays: `["alice@example.com"] ~= ["alice@example.com", "bob@example.com"]`
- Null/empty equivalence when the expected side is empty: `"null" ~= []`
- Numeric string coercion: `"11" ~= 11`

`!~=` is the negation.

```mlld
when [
  @mx.args.recipients ~= ["alice@example.com", "bob@example.com"] => show "Authorized recipients"
  @mx.args.cc !~= [] => show "Unexpected CC"
  * => show "Blocked"
]
```
