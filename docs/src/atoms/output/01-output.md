---
id: output-directive
title: Output Directive
brief: Write data to files or streams
category: output
tags: [output, files, streams, io]
related: [log, append]
related-code: [interpreter/eval/output.ts, grammar/patterns/output.peggy]
updated: 2026-04-08
qa_tier: 1
---

```mlld
output @content to "out.txt"
output @data to "config.json"
output @message to stdout
output @error to stderr
```

Objects and arrays are automatically serialized to JSON when writing to `.json` files. For other file types, the value is converted to a string.

`output` reads fields through the normal wrapper-preserving field-access path first, then renders through the display boundary. That means `@value.email` keeps label/fact metadata while it is being selected, but the final write is text (or JSON for `.json` targets).

When writing to `state://...`, mlld materializes plain data instead of storing wrappers.

## See Also

- [Append Directive](./append.md) - Append structured or text output incrementally.
- [Log Directive](./log.md) - Emit output to stderr.
- [Pipelines Basics](../syntax/pipelines-basics.md) - Attach `output` as a pipeline effect stage.
