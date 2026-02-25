---
id: output-directive
title: Output Directive
brief: Write data to files or streams
category: output
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
output @config.yaml() to "settings.yaml"
output @results.json() to "results.json"
output @plain.text() to "plain.txt"
```

Use transformer methods before `output` when you need a specific file format:

| Transformer | Behavior |
|------------|----------|
| `@value.json()` | Emit JSON text |
| `@value.yaml()` | Emit YAML text |
| `@value.text()` | Emit plain text |

Examples:

```mlld
output @data.json() to "results.json"
output @data.yaml() to "config.yml"
output @data.text() to "plain.txt"
```

## See Also

- [Append Directive](./append.md) - Append structured or text output incrementally.
- [Log Directive](./log.md) - Emit output to stderr.
- [Pipelines Basics](../syntax/pipelines-basics.md) - Attach `output` as a pipeline effect stage.
