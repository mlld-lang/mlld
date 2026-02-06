---
id: when-local-vars
title: Local Variables in When
brief: Block-scoped variables with let
category: control-flow
parent: when
tags: [conditionals, variables, scope]
related: [when-blocks]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
---

**Local variables in when:**

```mlld
when @mode [
  let @prefix = "Status:"
  "active" => show "@prefix Active"
  "pending" => show "@prefix Pending"
  * => show "@prefix Unknown"
]
```

**Augmented assignment:**

```mlld
exe @collect() = when [
  let @items = []
  @items += "a"
  @items += "b"
  * => @items  >> ["a", "b"]
]
```

`+=` works with arrays (concat), strings (append), objects (merge).
