---
id: file-directive
title: File Directive
brief: Write one file from an expression
category: output
tags: [output, file, workspace]
related: [append, output, box-directive]
related-code: [grammar/directives/file.peggy, interpreter/eval/file.ts]
updated: 2026-03-04
qa_tier: 1
---

```mlld
file "task.md" = @task
file "notes/today.md" = `## Notes\n@summary`
```

`file` writes exactly one path. Paths must be relative and cannot use `..`.

