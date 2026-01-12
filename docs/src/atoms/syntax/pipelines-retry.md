---
id: pipelines-retry
title: Retry in Pipelines
brief: Automatic retry with feedback
category: syntax
parent: pipelines
tags: [pipelines, retry, error-handling]
related: [pipelines-context, pipelines-basics]
related-code: [interpreter/eval/pipeline.ts, interpreter/eval/retry.ts]
updated: 2026-01-05
qa_tier: 2
---

**Retry in pipelines:**

```mlld
exe @validator(input) = when first [
  @input.valid => @input
  @mx.try < 3 => retry "need more detail"
  * => "fallback"
]
var @result = @raw | @validator
```
