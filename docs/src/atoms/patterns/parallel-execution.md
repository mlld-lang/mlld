---
id: pattern-parallel-execution
title: Parallel Execution Pattern
brief: Run independent tasks concurrently
category: patterns
parent: patterns
tags: [patterns, parallel, concurrency, async]
related: [for-parallel, pipelines-parallel, checkpoint, hooks]
related-code: []
updated: 2026-01-05
---

```mlld
>> Parallel for
for parallel(3) @task in @tasks [
  let @result = @runTask(@task)
  show `Done: @task.id`
]

>> Parallel pipeline groups
var @results = || @fetchA() || @fetchB() || @fetchC()

>> With error handling
exe @runAll(tasks) = [
  let @results = for parallel @t in @tasks => @run(@t)
  => when [
    @mx.errors.length == 0 => @results
    * => @repair(@results, @mx.errors)
  ]
]
```

**Hooks** for batch telemetry: `op:for:iteration` and `op:for:batch` filters observe parallel loop progress. **Checkpoint** caches `llm`-labeled calls across parallel items — `--resume` avoids re-calling completed items.
