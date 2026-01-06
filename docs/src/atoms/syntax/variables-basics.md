---
id: variables-basics
title: Variables Basics
brief: Create primitives, arrays, and objects
category: syntax
parent: variables
tags: [variables, primitives, arrays, objects]
related: [variables-conditional, templates-basics]
related-code: [interpreter/eval/var.ts, grammar/patterns/var.peggy]
updated: 2026-01-05
---

**Basic variable creation:**

```mlld
var @n = 42
var @price = 19.99
var @ok = true
var @arr = [1, 2, 3]
var @obj = {"key": "value"}
var @merged = { ...@obj, "extra": 1 }    >> object spread
```

**From command/code results:**

```mlld
exe @add(a, b) = js { return a + b }
var @sum = @add(@n, 8)         >> 50 (number preserved)

var @date = cmd {date}         >> command result
var @readme = <README.md>      >> file contents
```
