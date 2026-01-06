---
id: log
title: Log Directive
brief: Syntactic sugar for output to stdout
category: commands
parent: commands
tags: [output, logging, stdout, sugar]
related: [output, for-arrow]
related-code: [interpreter/eval/log.ts, grammar/patterns/log.peggy]
updated: 2026-01-05
---

**Syntactic sugar for `output to stdout`. Works in action contexts.**

```mlld
log @message                        >> same as output @message to stdout
log `Processing: @item`

>> In action contexts
for @item in @items => log @item
when @debug => log "Debug info"
```
