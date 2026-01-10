---
id: mistake-js-template-syntax
title: JavaScript Template Syntax
brief: Use @var not ${var}
category: mistakes
parent: mistakes
tags: [mistakes, templates, syntax]
related: [templates-basics]
related-code: []
updated: 2026-01-05
---

Use `@var` not `${var}`. mlld is not JavaScript.

```mlld
>> Wrong
var @msg = "Hello ${name}"
show `Result: ${count}`

>> Correct
var @msg = "Hello @name"
show `Result: @count`
```
