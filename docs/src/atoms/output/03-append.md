---
id: append
title: Append Directive
brief: Append newline-delimited records
category: commands
parent: commands
tags: [output, append, jsonl, logging]
related: [output, log, pipelines-basics]
related-code: [interpreter/eval/append.ts, grammar/patterns/append.peggy]
updated: 2026-01-05
qa_tier: 1
---

```mlld
append @record to "events.jsonl"        >> JSON object per line
append "raw line" to "events.log"

>> In pipelines
var @_ = @data | append "audit.jsonl"

>> In loops
for @name in @runs => append @name to "pipeline.log"
```

`.jsonl` enforces JSON serialization. Other extensions write text. `.json` blocked.
