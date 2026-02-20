---
id: for-context
title: For Loop Context
brief: Access loop state with @mx.for and @item.mx.index
category: control-flow
parent: for
tags: [iteration, loops, metadata, context]
related: [for-arrow, for-block, for-parallel, for-object]
related-code: [interpreter/eval/for.ts, interpreter/eval/for/iteration-runner.ts, interpreter/env/ContextManager.ts]
updated: 2026-02-16
qa_tier: 2
---

**Loop context via @mx.for:**

```mlld
var @items = [10, 20, 30]
for @n in @items => show `Index: @mx.for.index, Value: @n`
>> Output:
>> Index: 0, Value: 10
>> Index: 1, Value: 20
>> Index: 2, Value: 30
```

**Available @mx.for fields:**

- `@mx.for.index` - Current 0-based iteration index
- `@mx.for.total` - Total number of items in collection
- `@mx.for.key` - Key for objects, stringified index for arrays
- `@mx.for.parallel` - Boolean indicating parallel execution

**Array binding metadata @item.mx.index:**

```mlld
var @items = [10, 20, 30]
for @item in @items => show `Item @item.mx.index: @item`
>> Output:
>> Item 0: 10
>> Item 1: 20
>> Item 2: 30
```

For arrays, the loop-bound variable exposes `@item.mx.index` with the zero-based array position. This works in expressions, `when` filters, templates, directive bodies, and nested loops.

**Object iteration:**

```mlld
var @cfg = {"host": "localhost", "port": 3000}
for @v in @cfg => show `Key: @v.mx.key, Value: @v`
>> Output:
>> Key: host, Value: localhost
>> Key: port, Value: 3000
```

Object iteration binds `@v.mx.key` but does not set `@v.mx.index`.

**In parallel loops:**

```mlld
var @tasks = ["a", "b", "c"]
for parallel(2) @t in @tasks => show `Task @mx.for.index (@mx.for.parallel): @t`
```

`@mx.for.parallel` returns `true` in parallel loops, `false` in sequential loops. The index preserves original array position even when iterations complete out of order.
