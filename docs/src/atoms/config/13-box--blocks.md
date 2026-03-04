---
id: box-blocks
qa_tier: 2
title: Box Blocks
brief: Scoped execution within a box configuration
category: config
parent: box
tags: [box, blocks, isolation, scoping]
related: [box-overview, box-config, security-policies]
related-code: [interpreter/eval/box.ts, grammar/directives/box.peggy]
updated: 2026-03-04
---

Execute directives within a scoped environment using `box @config [ ... ]`.

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }

box @sandbox [
  run cmd { echo "inside sandbox" }
]
```

The environment is active only within the block and released on exit.

**Return values:**

```mlld
var @config = { tools: ["Read", "Write"] }

var @result = box @config [
  => "completed"
]

show @result
```

Use `=>` to return a value from the block.

**Inline derivation with `with`:**

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }

var @result = box @sandbox with { tools: ["Read"] } [
  => "read-only mode"
]

show @result
```

Derives a restricted environment inline without naming it.

**Named child environments:**

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }
var @readOnly = { ...@sandbox, tools: ["Read"] }

box @readOnly [
  run cmd { cat README.md }
]
```

Child environments can only restrict parent capabilities, never extend them.

**Notes:**
- Directives inside blocks use bare syntax (no `/` prefix)
- Environment resources are released when the block exits
- `with { ... }` is box directive config syntax (`box @cfg with { ... } [ ... ]`), not a general object-modifier expression
- See `box-overview` for concepts, `box-config` for configuration fields
