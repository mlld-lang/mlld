---
id: bail
title: Bail Directive
brief: Terminate script execution with exit code 1
category: control-flow
tags: [exit, termination, error-handling]
related: [if, when, no-early-exit]
related-code: [interpreter/eval/bail.ts, grammar/directives/bail.peggy, core/errors/MlldBailError.ts]
updated: 2026-02-16
qa_tier: 2
---

Terminates the entire script immediately with exit code 1. Works from any context including nested blocks and imported modules.

```mlld
>> Explicit message
bail "config file missing"

>> With variable interpolation
var @missing = "database"
bail `Missing: @missing`

>> Bare bail (uses default message)
bail
```

**Exit from nested contexts:**

```mlld
>> From if blocks
if @checkFailed [
  bail "validation failed"
]

>> From when expressions
when [
  !@ready => bail "not ready"
  * => @process()
]

>> From for loops
for @item in @items [
  if !@item.valid [
    bail `Invalid item: @item.id`
  ]
]
```

**Terminates imported modules:**

When an imported module calls `bail`, the entire script terminates, not just the module:

```mlld
>> module.mld
if !@configured [
  bail "module not configured"
]
export { data: "ok" }

>> main.mld
import { data } from "./module.mld"  >> terminates here
show @data  >> never reached
```

**Markdown mode:**

```mlld
/bail "markdown mode termination"
```

**Exit behavior:**
- Throws `MlldBailError` with code `BAIL_EXIT`
- Exit code: 1
- Default message: "Script terminated by bail directive."
- Message accepts strings, variables, and expressions
