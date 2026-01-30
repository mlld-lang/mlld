---
id: if
title: If Blocks
brief: Imperative branching with optional else
category: control-flow
tags: [conditionals, branching, blocks]
related: [when-simple, exe-blocks]
related-code: [interpreter/eval/if.ts, grammar/directives/if.peggy]
updated: 2026-01-30
qa_tier: 2
---

`if` runs imperative branches. Use block form with optional `else`.

```mlld
if @isProd [
  show "Production mode"
] else [
  show "Local mode"
]
```

`if` works at top level and inside `exe` blocks:

```mlld
exe @validate(input) = [
  if !@input [
    => { error: "missing" }
  ]
  => { ok: @input }
]
```

Use `=>` only inside `exe` blocks.
