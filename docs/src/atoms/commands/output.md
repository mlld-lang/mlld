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
qa_tier: 1
---

```mlld
output @content to "out.txt"
output @data to "config.json"
output @message to stdout
output @error to stderr
output @config to "settings.yaml" as yaml
output @results to "results.json" as json
output @plain to "plain.txt" as text
```

Supported format specifiers for `output ... as <format>`:

| Specifier | Behavior |
|-----------|----------|
| `as json` | Parse JSON text and write pretty-printed JSON when possible |
| `as yaml` | Parse JSON text and emit YAML when possible |
| `as text` | Write plain text content as-is |

Examples:

```mlld
output @data as json to "results.json"
output @data as yaml to "config.yml"
output @data as text to "plain.txt"
```

## See Also

- [Append Directive](./append.md) - Append structured or text output incrementally.
- [Log Directive](./log.md) - Emit output to stderr.
- [Pipelines Basics](../syntax/pipelines-basics.md) - Attach `output` as a pipeline effect stage.
