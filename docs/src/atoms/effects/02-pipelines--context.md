---
id: pipelines-context
title: Pipeline Context
brief: Access pipeline metadata during execution
category: effects
parent: pipelines
tags: [pipelines, metadata, context]
related: [pipelines-basics, pipelines-retry]
related-code: [interpreter/eval/pipeline.ts, interpreter/env/PipelineContext.ts]
updated: 2026-01-05
qa_tier: 2
---

**Pipeline context:**
- `@mx.try` - current attempt number
- `@mx.stage` - current 1-based stage index (`1`, `2`, `3`, ...)
- `@p[-1]` - previous stage output (same value as current stage input)

```mlld
exe @trace(input) = [
  show `stage=@mx.stage value=@input`
  => @mx.input
]

var @result = " hello " | @trace | @trim | @trace
>> Output:
>> stage=1 value= hello
>> stage=3 value=hello
```
