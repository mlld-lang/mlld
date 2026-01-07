---
id: mistake-missing-at
title: Missing @ Prefix
brief: Variables always need @ prefix
category: mistakes
parent: mistakes
tags: [mistakes, variables, syntax]
related: [variables-basics]
related-code: []
updated: 2026-01-05
---

Variables always need `@` prefix.

```mlld
>> Wrong
var greeting = "Hello"

>> Correct
var @greeting = "Hello"
```
