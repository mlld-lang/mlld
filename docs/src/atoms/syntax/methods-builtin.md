---
id: methods-builtin
title: Builtin Methods
brief: Array and string methods
category: syntax
parent: methods
tags: [arrays, strings, methods, builtins]
related: [variables-basics, templates-basics]
related-code: [interpreter/eval/method-call.ts, core/builtins/array-methods.ts, core/builtins/string-methods.ts]
updated: 2026-01-05
---

**Array methods:**
- `@arr.includes(value)` - true if contains value
- `@arr.indexOf(value)` - index or -1
- `@arr.length` - array length
- `@arr.join(separator)` - join to string

**String methods:**
- `@str.includes(sub)` - true if contains substring
- `@str.indexOf(sub)` - index or -1
- `@str.length` - string length
- `@str.toLowerCase()` / `toUpperCase()`
- `@str.trim()` - remove whitespace
- `@str.startsWith(prefix)` / `endsWith(suffix)`
- `@str.split(separator)` - split to array

```mlld
var @fruits = ["apple", "banana", "cherry"]
var @message = "Hello World"

show @fruits.includes("banana")    >> true
show @fruits.join(" and ")         >> "apple and banana and cherry"
show @message.toLowerCase()        >> "hello world"
show @message.split(" ")           >> ["Hello", "World"]

>> Method chaining
show @message.trim().toLowerCase().startsWith("hello")  >> true
```
