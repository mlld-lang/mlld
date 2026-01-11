---
id: pipelines-basics
title: Pipelines Basics
brief: Chain stages with built-in and custom functions
category: syntax
parent: pipelines
tags: [pipelines, transforms, builtins]
related: [pipelines-context, pipelines-retry, pipelines-parallel]
related-code: [interpreter/eval/pipeline.ts, core/builtins/pipeline-builtins.ts]
updated: 2026-01-05
qa_tier: 1
---

```mlld
var @users = cmd {cat users.json} | @json | @csv

>> Custom functions in pipelines
exe @double(n) = js { return n * 2 }
var @x = cmd {echo "5"} | @double

>> JSON parsing modes
var @relaxed = @input | @json.loose   >> single quotes, trailing commas
var @strict = @input | @json.strict   >> strict JSON only
var @extracted = @llmResponse | @json.llm  >> extract from LLM response
```
