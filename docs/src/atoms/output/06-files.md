---
id: files-directive
title: Files Directive
brief: Write multiple files from an array
category: output
tags: [output, files, workspace, resolver]
related: [file-directive, box-directive]
related-code: [grammar/directives/file.peggy, interpreter/eval/file.ts]
updated: 2026-03-04
qa_tier: 1
---

```mlld
files "src/" = [
  { "index.js": @source, desc: "Entry point" },
  { "config.json": @config }
]

files <@workspace/> = [
  { "README.md": @readme }
]
```

`files` accepts an array of objects where each object has one file key and optional `desc`.

