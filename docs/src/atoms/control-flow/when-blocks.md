---
id: when-blocks
title: Block Actions in When
brief: Side effects and return with block syntax
category: control-flow
parent: when
tags: [conditionals, blocks]
related: [when, exe-blocks, if]
related-code: [interpreter/eval/when.ts, interpreter/eval/block.ts]
updated: 2026-01-31
qa_tier: 2
---

**Block actions** (side effects + return):

```mlld
var @result = when [
  @needsProcessing => [
    show "Processing..."
    let @processed = @transform(@data)
    => @processed
  ]
  * => @data
]
```

Conditions evaluate in order and the first match runs.

Inside `exe` blocks, a matched `when` action that evaluates to a value returns from the enclosing `exe`.
Use block-form return for explicit intent:

```mlld
exe @guard(x) = [
  when !@x => [
    => "missing"
  ]
  => "ok"
]
```

`when !@x => "missing"` also returns from the `exe`. `mlld validate` warns on this implicit form and suggests block-form return for clarity.
