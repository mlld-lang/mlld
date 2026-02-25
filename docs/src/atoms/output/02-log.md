---
id: log
title: Log Directive
brief: Syntactic sugar for output to stderr
category: commands
parent: commands
tags: [output, logging, stderr, sugar]
related: [output, for-arrow]
related-code: [interpreter/eval/log.ts, grammar/patterns/log.peggy]
updated: 2026-01-05
qa_tier: 1
---

```mlld
var @debugMode = true

log @message                        >> same as output @message to stderr
log `Processing: @item`

>> In action contexts
for @item in @items => log @item
when @debugMode => log "Debug info"
```

## See Also

- [Output Directive](./output.md) - File/stdout/stderr output patterns and formatting.
- [Pipelines Basics](../syntax/pipelines-basics.md) - Use `| log` as a pipeline effect stage.
