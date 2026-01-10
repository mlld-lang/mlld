---
id: run-stdin
title: Run Command Stdin
brief: Pass data via stdin to commands
category: commands
parent: run
tags: [execution, commands, stdin, pipes]
related: [run-basics, pipelines-basics]
related-code: [interpreter/eval/run.ts, interpreter/env/Stdin.ts]
updated: 2026-01-05
---

**Stdin support:**

```mlld
var @data = '[{"name":"Alice"}]'
run cmd { cat | jq '.[]' } with { stdin: @data }

>> Pipe sugar (equivalent)
run @data | { cat | jq '.[]' }
```
