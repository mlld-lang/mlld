---
id: file-loading-json-accessors
title: JSON String Accessors
brief: Parse JSON strings with .data and stringify with .text
category: syntax
parent: file-loading
tags: [json, parsing, strings]
related: [pipelines-basics, variables-basics]
related-code: [interpreter/eval/field-access.ts]
updated: 2026-01-05
---

**JSON string accessors** (`.data` and `.text`):

```mlld
>> When you have a JSON string and need to parse it
var @jsonStr = '[{"name":"Alice"},{"name":"Bob"}]'
var @parsed = @jsonStr.data          >> parses JSON string to array/object
show @parsed.0.name                  >> "Alice"

>> When you have an object and need the JSON string
var @obj = {"name": "Alice"}
var @str = @obj.text                 >> stringified JSON
show @str                            >> '{"name":"Alice"}'

>> Common in pipelines with LLM responses
var @response = @llm("return JSON") | @json.llm
var @items = @response.data          >> if response is JSON string
```
