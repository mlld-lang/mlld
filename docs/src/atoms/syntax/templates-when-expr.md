---
id: templates-when-expr
title: When Expressions in Templates
brief: Conditional values inside templates
category: syntax
parent: templates
tags: [templates, conditionals, when]
related: [when-simple, templates-basics]
related-code: [interpreter/eval/template.ts, interpreter/eval/when.ts]
updated: 2026-01-05
qa_tier: 2
---

**When-expressions in templates:**

```mlld
var @status = when [ @score > 90 => "A" * => "F" ]
var @arr = [ 1, when [ @flag => 2 ], 3 ]
```
