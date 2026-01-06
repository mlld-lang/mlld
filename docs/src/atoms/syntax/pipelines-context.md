---
id: pipelines-context
title: Pipeline Context
brief: Access pipeline metadata during execution
category: syntax
parent: pipelines
tags: [pipelines, metadata, context]
related: [pipelines-basics, pipelines-retry]
related-code: [interpreter/eval/pipeline.ts, interpreter/env/PipelineContext.ts]
updated: 2026-01-05
---

**Pipeline context:**
- `@mx.try` - current attempt number
- `@mx.stage` - current stage name
- `@p[-1]` - previous stage output
