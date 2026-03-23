---
id: builtins-methods
qa_tier: 1
title: Methods
brief: String and array methods
category: core
parent: builtins
tags: [builtins, arrays, strings, methods]
related: [variables-basics, builtins-transformers, builtins-checks]
related-code: [interpreter/eval/method-call.ts, core/builtins/array-methods.ts, core/builtins/string-methods.ts]
updated: 2026-02-24
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
- `@arr.flat(depth?)` - flatten nested arrays (default depth 1)
- `@arr.at(index)` - element at index (supports negative indices)

**Wildcard projection:**
- `@arr[*].field` - extract `.field` from every element, producing a flat array

**Helpers:**
- `@keep(obj, [...keys])` - keep only specified keys from object
- `@keepStructured(obj, schema)` - keep keys matching a schema structure

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

>> Wildcard projection
var @tools = [{"name": "readData"}, {"name": "verify"}, {"name": "sendEmail"}]
show @tools[*].name                       >> ["readData", "verify", "sendEmail"]
show @tools[*].name.includes("verify")    >> true
```
