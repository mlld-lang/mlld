---
id: stream
title: Streaming
brief: Stream output during execution
category: commands
parent: commands
tags: [streaming, output, parallel]
related: [exe-simple, pipelines-parallel]
related-code: [interpreter/eval/stream.ts, grammar/patterns/stream.peggy]
updated: 2026-01-05
---

**Stream output during execution:**

```mlld
stream @claude("prompt")           >> keyword form
stream @generateReport()           >> directive form

>> Parallel streams
stream @a() || stream @b()         >> concurrent, buffered results
```

Suppress: `--no-stream` flag or `MLLD_NO_STREAM=true`
