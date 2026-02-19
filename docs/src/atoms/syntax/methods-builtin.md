---
id: methods-builtin
title: Builtin Methods
brief: Array and string methods
category: syntax
parent: builtins
tags: [arrays, strings, methods, builtins]
related: [variables-basics, templates-basics, builtins]
related-code: [interpreter/eval/method-call.ts, core/builtins/array-methods.ts, core/builtins/string-methods.ts]
updated: 2026-01-05
---

**String methods:**
- `@str.length` - string length
- `@str.includes(sub)` - true if contains substring
- `@str.indexOf(sub)` - index or -1
- `@str.startsWith(prefix)` / `endsWith(suffix)`
- `@str.toLowerCase()` / `toUpperCase()`
- `@str.trim()` - remove whitespace
- `@str.split(separator)` - split to array
- `@str.slice(start, end?)` - extract substring by position
- `@str.substring(start, end?)` - extract substring (no negative indices)
- `@str.replace(search, replacement)` - replace first match (accepts string or regex)
- `@str.replaceAll(search, replacement)` - replace all matches (accepts string or regex)
- `@str.replaceAll({"old": "new", ...})` - bulk replacement via object map (applied sequentially)
- `@str.match(pattern)` - match against string or regex, returns match array or null
- `@str.padStart(length, char?)` / `padEnd(length, char?)` - pad to target length
- `@str.repeat(count)` - repeat string N times

**Array methods:**
- `@arr.length` - array length
- `@arr.includes(value)` - true if contains value
- `@arr.indexOf(value)` - index or -1
- `@arr.join(separator)` - join to string
- `@arr.slice(start, end?)` - extract sub-array by position
- `@arr.concat(other)` - combine arrays
- `@arr.reverse()` - reverse order (returns new array)
- `@arr.sort()` - sort alphabetically (returns new array)

Method chains can continue across lines when continuation lines start with `.`

```mlld
var @fruits = ["apple", "banana", "cherry"]
var @message = "Hello World"

show @fruits.includes("banana")    >> true
show @fruits.join(" and ")         >> "apple and banana and cherry"
show @message.toLowerCase()        >> "hello world"
show @message.split(" ")           >> ["Hello", "World"]

>> Method chaining
show @message.trim().toLowerCase().startsWith("hello")  >> true

>> Multiline method chaining
exe @normalize(text) = @text
  .trim()
  .toLowerCase()
  .replace("hello", "hi")
```
