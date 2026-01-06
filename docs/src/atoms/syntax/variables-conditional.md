---
id: variables-conditional
title: Conditional Inclusion
brief: Omit content when variable is falsy using @var?
category: syntax
parent: variables
tags: [variables, conditionals, optional]
related: [variables-basics, variables-truthiness]
related-code: [interpreter/eval/template.ts, grammar/patterns/var.peggy]
updated: 2026-01-05
---

**Conditional inclusion** (`@var?`): omit content when variable is falsy.

```mlld
var @tools = "json"
var @empty = ""

>> In commands: @var?`...`
run cmd { echo @tools?`--tools "@tools"` @empty?`--empty` }
>> Output: --tools "json" (--empty omitted)

>> In arrays
var @list = [@a, @b?, @c]   >> @b omitted if falsy

>> In objects
var @obj = {"name": @n, "title"?: @t}   >> title omitted if @t falsy
```
