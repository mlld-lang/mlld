---
id: pattern-llm-integration
title: LLM Integration Pattern
brief: Call LLMs with structured prompts
category: patterns
parent: patterns
tags: [patterns, llm, prompts, integration]
related: [exe-blocks, pipelines-basics]
related-code: []
updated: 2026-01-05
---

```mlld
import { @haiku, @sonnet } from "@lib/claude.mld"

exe @classify(text) = [
  let @prompt = `Classify this text as positive/negative/neutral: @text`
  let @response = @haiku(@prompt)
  => @response.trim().toLowerCase()
]

exe @analyze(data) = [
  let @prompt = `Analyze this data and return JSON: @data|@json`
  let @response = @sonnet(@prompt)
  => @response | @json.llm
]
```
