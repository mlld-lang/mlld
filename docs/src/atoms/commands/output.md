---
id: output
title: Output Directive
brief: Write data to files or streams
category: commands
parent: commands
tags: [output, files, streams, io]
related: [log, append]
related-code: [interpreter/eval/output.ts, grammar/patterns/output.peggy]
updated: 2026-01-05
---

```mlld
output @content to "out.txt"
output @data to "config.json"
output @message to stdout
output @error to stderr
output @config to "settings.yaml" as yaml
```
