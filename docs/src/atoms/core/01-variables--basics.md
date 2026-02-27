---
id: variables-basics
title: Variables Basics
brief: Create primitives, arrays, objects, or assign from command/code results
category: core
parent: variables
aliases: [var, variable]
tags: [variables, primitives, arrays, objects]
related: [variables-conditional, templates-basics, exe-simple, builtins-reserved-variables]
related-code: [interpreter/eval/var.ts, grammar/patterns/var.peggy]
updated: 2026-01-05
qa_tier: 1
---

**var vs exe:** `var` creates values (no parameters). `exe` creates functions (takes parameters).

```mlld
var @name = "Alice"            >> value - no params
exe @greet(who) = `Hi @who!`   >> function - takes params

>> Use var for computed values, exe for reusable functions
var @result = @greet(@name)    >> "Hi Alice!"
```

**Primitives, arrays, objects:**

```mlld
var @n = 42
var @price = 19.99
var @ok = true
var @arr = [1, 2, 3]
var @obj = {"key": "value"}
var @merged = { ...@obj, "extra": 1 }    >> object spread

exe @add(a, b) = js { return a + b }
var @sum = @add(@n, 8)         >> 50 (number preserved)

var @date = cmd {date}         >> command result
var @readme = <README.md>      >> file contents
```

## See Also

- [Conditional Inclusion](./variables-conditional.md) - `@var?` omission and nullish fallback patterns.
- [Templates Basics](./templates-basics.md) - Variable interpolation in template strings.
- [Exe Simple Forms](../commands/exe-simple.md) - When to switch from `var` values to reusable `exe` functions.
