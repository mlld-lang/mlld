---
id: builtins-transformers
qa_tier: 1
title: Transformers
brief: Built-in pipe stages for parsing, formatting, and transforming
category: core
parent: builtins
tags: [builtins, transformers, parse, pipelines]
related: [pipelines-basics, builtins-reserved-variables, builtins-checks]
related-code: [interpreter/builtin/transformers.ts]
updated: 2026-02-24
---

Used with `|` in pipelines. Each receives the previous value.

- `@parse` - parse JSON (default mode)
- `@parse.strict` - strict JSON only
- `@parse.loose` - single quotes, trailing commas
- `@parse.llm` - extract JSON from LLM response text
- `@xml` - parse XML
- `@csv` - parse CSV
- `@md` - parse markdown
- `@upper` - uppercase string
- `@lower` - lowercase string
- `@trim` - strip whitespace
- `@pretty` - pretty-print JSON
- `@sort` - sort array

```mlld
var @users = cmd { cat users.json } | @parse
var @extracted = @llmResponse | @parse.llm
var @clean = @raw | @trim | @lower
```
