---
id: for-parallel
title: Parallel For
brief: Concurrent iteration with for parallel
category: control-flow
parent: for
tags: [iteration, loops, parallel, concurrency]
related: [for-arrow, for-block]
related-code: [interpreter/eval/for.ts, interpreter/eval/parallel.ts]
updated: 2026-01-05
qa_tier: 2
---

Run iterations concurrently with `for parallel`.

```mlld
>> Default concurrency (MLLD_PARALLEL_LIMIT, default 4)
for parallel @x in @items => show @x

>> Custom concurrency cap
for parallel(3) @task in @tasks => @runTask(@task)

>> With pacing (delay between starts)
for parallel(2, 1s) @x in @items => @process(@x)
```

**Parallel blocks:**

```mlld
for parallel(3) @task in @tasks [
  let @result = @runTask(@task)
  show `Done: @task.id`
]
```

**Error handling:**
- Errors accumulate in `@mx.errors`
- Failed iterations add error markers to results
- Outer-scope writes blocked (use block-scoped `let` only)

```mlld
exe @process(tasks) = [
  let @results = for parallel @t in @tasks => @run(@t)
  => when [
    @mx.errors.length == 0 => @results
    * => @repair(@results, @mx.errors)
  ]
]
```
