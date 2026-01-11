---
id: templates-basics
title: Templates Basics
brief: String interpolation with backticks and double-colon
category: syntax
parent: templates
tags: [templates, strings, interpolation]
related: [templates-when-expr, templates-loops, variables-basics]
related-code: [interpreter/eval/template.ts, grammar/patterns/template.peggy]
updated: 2026-01-05
qa_tier: 1
---

```mlld
var @message = `Hello @name, welcome!`
var @doc = ::Use `mlld` to orchestrate::

>> Multi-line
var @report = `
Status: @status
Config: <@base/config.json>
Data: @data|@json
`
```
