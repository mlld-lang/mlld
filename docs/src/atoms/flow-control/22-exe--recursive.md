---
id: exe-recursive
qa_tier: 2
title: Recursive Functions
brief: Self-calling exe functions with bounded depth
category: flow-control
tags: [recursion, exe, functions]
related: [exe-block, while, for-parallel]
related-code: [interpreter/eval/exec-invocation.ts, interpreter/env/Environment.ts]
updated: 2026-03-06
---

Add the `recursive` label to allow a function to call itself.

```mlld
exe @lte1(n)   = js { return n <= 1 }
exe @dec(n)    = js { return n - 1 }
exe @mul(a, b) = js { return a * b }

exe recursive @fact(n) = [
  when @lte1(@n) => 1
  let @prev = @dec(@n)
  let @rest = @fact(@prev)
  => @mul(@n, @rest)
]

show @fact(5)   >> 120
```

Without `recursive`, any self-call throws `CircularReferenceError` immediately. The label opts in to bounded recursion.

**Depth limit**

Default maximum depth: 64. Override with the `MLLD_RECURSION_DEPTH` environment variable:

```bash
MLLD_RECURSION_DEPTH=128 mlld run myscript
```

When the limit is exceeded:
```
'@fact' exceeded maximum recursion depth (64). Add a base case or
increase the limit with MLLD_RECURSION_DEPTH.
```

**Works inside `for` and `for parallel`**

Each iteration runs independently — concurrent branches track their own depth:

```mlld
var @inputs  = [1, 2, 3, 4, 5]
var @results = for parallel(3) @n in @inputs => @fact(@n)
show @results   >> [1, 2, 6, 24, 120]
```

**Combining with `exe llm`**

```mlld
exe recursive llm @plan(task) = [
  when @task.depth >= @maxDepth => @withKind(@task, "atomic")
  let @kind     = @classify(@task)
  when @kind   == "atomic" => @withKind(@task, "atomic")
  let @children = @decompose(@task)
  let @planned  = for parallel(5) @child in @children => @plan(@child)
  => @withChildren(@task, @planned)
]
```

Each recursive call is cached independently by the checkpoint system.

**Writing recursive functions**

Bind the recursive call to a `let` before using the result:

```mlld
>> ✅ correct — recursive call is a separate statement
exe recursive @fact(n) = [
  when @lte1(@n) => 1
  let @prev = @dec(@n)
  let @rest = @fact(@prev)
  => @mul(@n, @rest)
]
```

**Non-recursive functions** without the label still throw immediately on any self-call — behavior is unchanged.
