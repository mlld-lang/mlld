---
id: file-loading-json-accessors
title: JSON Parsing
brief: Parse JSON strings with pipeline transforms
category: syntax
parent: file-loading
tags: [json, parsing, strings]
related: [pipelines-basics, variables-basics]
related-code: [interpreter/builtin/transformers.ts]
updated: 2026-01-05
qa_tier: 2
---

**Parse JSON explicitly with transforms:**

```mlld
>> When you have a JSON string and need to parse it
var @jsonStr = '[{"name":"Alice"},{"name":"Bob"}]'
var @parsed = @jsonStr | @parse
show @parsed.0.name                  >> "Alice"

>> When you have an object and need the JSON string
var @obj = {"name": "Alice"}
var @str = @obj | @parse
show @str                            >> '{"name":"Alice"}'

>> Common in pipelines with LLM responses
var @response = @llm("return JSON") | @parse.llm
var @items = @response
```
