---
id: templates-multiline
title: Multi-line Templates
brief: Templates spanning multiple lines
category: syntax
parent: templates
tags: [templates, multiline, strings]
related: [templates-basics, file-loading-basics]
related-code: [interpreter/eval/template.ts, grammar/patterns/template.peggy]
updated: 2026-01-05
---

**Multi-line templates:**

```mlld
var @report = `
Status: @status
Config: <@base/config.json>
Data: @data|@json
`
```
