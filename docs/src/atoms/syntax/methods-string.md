---
id: methods-string
title: String Methods
brief: Built-in string methods
category: syntax
parent: methods
tags: [strings, methods, builtins]
related: [methods-array, templates-basics]
related-code: [interpreter/eval/method-call.ts, core/builtins/string-methods.ts]
updated: 2026-01-05
---

**String methods:**
- `@str.includes(sub)` - true if contains substring
- `@str.indexOf(sub)` - index or -1
- `@str.length` - string length
- `@str.toLowerCase()` / `toUpperCase()`
- `@str.trim()` - remove whitespace
- `@str.startsWith(prefix)` / `endsWith(suffix)`
- `@str.split(separator)` - split to array

```mlld
var @message = "Hello World"

show @message.toLowerCase()        >> "hello world"
show @message.split(" ")           >> ["Hello", "World"]

>> Method chaining
show @message.trim().toLowerCase().startsWith("hello")  >> true
```
