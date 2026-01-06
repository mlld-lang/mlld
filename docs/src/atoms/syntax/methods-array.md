---
id: methods-array
title: Array Methods
brief: Built-in array methods
category: syntax
parent: methods
tags: [arrays, methods, builtins]
related: [methods-string, variables-basics]
related-code: [interpreter/eval/method-call.ts, core/builtins/array-methods.ts]
updated: 2026-01-05
---

**Array methods:**
- `@arr.includes(value)` - true if contains value
- `@arr.indexOf(value)` - index or -1
- `@arr.length` - array length
- `@arr.join(separator)` - join to string

```mlld
var @fruits = ["apple", "banana", "cherry"]

show @fruits.includes("banana")    >> true
show @fruits.join(" and ")         >> "apple and banana and cherry"
```
