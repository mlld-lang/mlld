---
id: pipelines-basics
title: Pipelines Basics
brief: Chain stages with built-in and custom functions
category: syntax
parent: pipelines
aliases: [pipeline, pipe]
tags: [pipelines, transforms, builtins]
related: [pipelines-context, pipelines-retry, pipelines-parallel]
related-code: [interpreter/eval/pipeline.ts, core/builtins/pipeline-builtins.ts]
updated: 2026-01-05
qa_tier: 1
---

Chain stages with `|`. Each stage receives the previous stage output as a single value.

Built-in transformers available in pipelines include:
- `@parse`
- `@trim`
- `@pretty`
- `@sort`

```mlld
var @users = cmd {cat users.json} | @parse

>> Built-ins and custom stages can be mixed
var @msg = "  hello pipeline  " | @trim
exe @double(n) = js { return Number(n) * 2 }
var @x = cmd {echo "5"} | @double

>> JSON parsing modes
var @relaxed = @input | @parse.loose   >> single quotes, trailing commas
var @strict = @input | @parse.strict   >> strict JSON only
var @extracted = @llmResponse | @parse.llm  >> extract from LLM response

>> Stages receive whole values (no implicit array auto-map)
var @items = ["  beta  ", " alpha "]
var @whole = @items | @trim
var @each = for @item in @items => @item | @trim

>> Handle failures with retry + fallback in a stage
exe @source() = "not-json"
exe @parseOrFallback(input) = when [
  @input.startsWith("{") => @input | @parse
  @mx.try < 2 => retry "expected JSON object"
  * => { ok: false, error: "invalid-json", raw: @input }
]
var @result = @source() | @parseOrFallback
```
