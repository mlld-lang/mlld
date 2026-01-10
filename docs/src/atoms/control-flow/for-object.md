---
id: for-object
title: Object Iteration
brief: Iterating over object key-value pairs
category: control-flow
parent: for
tags: [iteration, loops, objects]
related: [for-arrow]
related-code: [interpreter/eval/for.ts]
updated: 2026-01-05
---

**Object iteration:**

```mlld
var @cfg = {"host": "localhost", "port": 3000}
for @v in @cfg => show `@v.mx.key: @v`
>> Output: host: localhost, port: 3000
```
