---
id: append
title: Append Directive
brief: Append newline-delimited records
category: output
tags: [output, append, jsonl, logging]
related: [output, log, pipelines-basics]
related-code: [interpreter/eval/append.ts, grammar/patterns/append.peggy]
updated: 2026-04-08
qa_tier: 1
---

```mlld
append @record to "events.jsonl"        >> JSON object per line
append "raw line" to "events.log"

>> In pipelines
@data | append "audit.jsonl"

>> In loops
for @name in @runs => append @name to "pipeline.log"
```

`.jsonl` enforces JSON serialization. Other extensions write text. `.json` blocked.

`append` uses the same display boundary as `/show` and `/output` for text targets: wrapper-preserving field reads happen before rendering, then the appended payload is text. For `.jsonl`, mlld materializes plain JSON data per line.
