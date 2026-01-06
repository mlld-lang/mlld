---
id: file-loading-basics
title: File Loading Basics
brief: Load file contents with angle brackets
category: syntax
parent: file-loading
tags: [files, loading, angle-brackets]
related: [file-loading-globs, file-loading-ast, variables-basics]
related-code: [interpreter/eval/file-loading.ts, grammar/patterns/file-loading.peggy]
updated: 2026-01-05
---

**Angle brackets load file contents. JSON files auto-parse.**

```mlld
>> Basic loading
var @content = <README.md>
var @config = <config.json>          >> auto-parsed as object
var @author = <package.json>.author  >> field access
```
