---
id: variables-conditional
title: Conditional Inclusion
brief: Omit content with @var? and use nullish fallbacks in templates and expressions
category: syntax
parent: variables
tags: [variables, conditionals, optional]
related: [variables-basics, variables-truthiness]
related-code: [interpreter/eval/template.ts, grammar/patterns/var.peggy]
updated: 2026-01-30
qa_tier: 1
---

**Conditional inclusion** (`@var?`): omit content when a variable is falsy.
**Nullish fallback in templates** (`@var??"default"`): use tight `??` binding in template interpolation.
**Nullish fallback in expressions** (`@a ?? @b`): use spaced `??` in `var`/`let` expressions and chains.

```mlld
var @tools = "json"
var @empty = ""

>> In commands: @var?`...`
run cmd { echo @tools?`--tools "@tools"` @empty?`--empty` }
>> Output: --tools "json" (--empty omitted)

>> In templates: omit the variable itself
var @title = "MyTitle"
var @msg = `DEBUG:@title?`

>> In templates: tight null coalescing
var @missing = null
var @hello = `Hello,@missing??"friend"`

>> In expressions: spaced null coalescing (chaining works)
var @primary = null
var @secondary = "backup"
var @chosen = @primary ?? @secondary ?? "fallback"

>> In arrays
var @list = [@a, @b?, @c]   >> @b omitted if falsy

>> In objects
var @obj = {"name": @n, "title"?: @t}   >> title omitted if @t falsy
```
