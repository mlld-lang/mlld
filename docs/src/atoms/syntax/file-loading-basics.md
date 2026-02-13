---
id: file-loading-basics
title: File Loading Basics
brief: Load file contents with angle brackets and globs
category: syntax
parent: file-loading
aliases: [file, files, load]
tags: [files, loading, angle-brackets, globs]
related: [file-loading-ast, file-loading-metadata, variables-basics]
related-code: [interpreter/eval/file-loading.ts, grammar/patterns/file-loading.peggy]
updated: 2026-01-05
qa_tier: 1
---

```mlld
>> Basic loading
var @content = <README.md>
var @config = <config.json>          >> auto-parsed as object
var @author = <package.json>.author  >> field access

>> Globs (returns array)
var @docs = <docs/**/*.md>
show @docs.length
for @doc in @docs => show @doc.mx.filename

>> JSON globs - each item is auto-parsed
var @configs = <configs/*.json>
var @first = @configs[0]
show @first.name                     >> access parsed JSON
show @first.mx.filename              >> file metadata still available

>> With "as" template
var @toc = <docs/*.md> as "- [<>.mx.fm.title](<>.mx.relative)"
```
