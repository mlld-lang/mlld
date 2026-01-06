---
id: templates-basics
title: Templates Basics
brief: String interpolation with backticks
category: syntax
parent: templates
tags: [templates, strings, interpolation]
related: [templates-multiline, templates-double-colon, variables-basics]
related-code: [interpreter/eval/template.ts, grammar/patterns/template.peggy]
updated: 2026-01-05
---

**Prefer backticks; use `::` for backticks-in-text.**

```mlld
var @message = `Hello @name, welcome!`
var @doc = ::Use `mlld` to orchestrate::
```
