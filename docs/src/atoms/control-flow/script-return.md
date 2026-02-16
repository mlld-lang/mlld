---
id: script-return
title: Script Return
brief: Explicit script return with =>
category: control-flow
tags: [return, modules, script-level, default-export]
related: [if, when-value-returning, exe-blocks]
related-code: [interpreter/eval/exe-return.ts, interpreter/core/interpreter/traversal.ts, interpreter/eval/import/ModuleContentProcessor.ts]
updated: 2026-02-16
qa_tier: 2
---

`=> @value` terminates script execution immediately and returns a value. Top-level `if` and `when` branches can return through the script context.

**Basic script return:**

```mlld
>> Strict mode
=> "final result"
show "unreachable"
```

**Script return from conditionals:**

```mlld
if @condition [
  => "early exit"
]
=> "fallback"
```

```mlld
var @mode = "fast"
when @mode == "fast" => [
  if @ready [
    => "immediate"
  ]
]
=> "deferred"
```

**Module default export:**

Imported `.mld` modules expose script return values through `default`:

```mlld
>> module.mld
var @status = "active"
=> { code: 200, status: @status }
var @unreachable = "never runs"
```

```mlld
>> main.mld
import { default as @result, status as @s } from "./module.mld"
show @result.code     >> 200
show @s               >> "active"
```

Scripts without `=>` do not emit implicit final return output. Use `=>` explicitly when module consumers need a default export value.

**In exe blocks:**

`=> @value` returns from the function body. See exe-blocks for function return syntax.

```mlld
exe @validate(input) = [
  if !@input [
    => { error: "missing" }
  ]
  => { ok: @input }
]
```
