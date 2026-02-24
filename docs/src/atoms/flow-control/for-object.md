---
id: for-object
title: Object Iteration
brief: Iterating over object key-value pairs
category: control-flow
parent: for
tags: [iteration, loops, objects]
related: [for-arrow]
related-code: [interpreter/eval/for.ts]
updated: 2026-02-01
---

**Object iteration:**

```mlld
var @cfg = {"host": "localhost", "port": 3000}
for @k, @v in @cfg => show `@k: @v`
>> Output: host: localhost, port: 3000
```

**Value-only form:**

```mlld
for @v in @cfg => show `@v.mx.key: @v`
```

When you bind only the value, the key is available at `@v.mx.key` and `@v_key`. The key/value form does not bind `@v_key`.
