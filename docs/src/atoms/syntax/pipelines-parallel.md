---
id: pipelines-parallel
title: Parallel Pipeline Groups
brief: Run multiple stages concurrently
category: syntax
parent: pipelines
tags: [pipelines, parallel, concurrency]
related: [pipelines-basics, for-parallel]
related-code: [interpreter/eval/pipeline.ts, interpreter/eval/parallel.ts]
updated: 2026-01-05
---

**Parallel groups:**

```mlld
>> Two transforms run concurrently
var @results = || @fetchA() || @fetchB() || @fetchC()

>> With concurrency cap
var @capped = || @a() || @b() || @c() (2, 100ms)  >> cap=2, 100ms pacing
```
