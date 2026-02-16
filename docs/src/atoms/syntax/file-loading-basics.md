---
id: file-loading-basics
title: File Loading Basics
brief: Load file contents with angle brackets and globs
category: syntax
parent: file-loading
aliases: [file, files, load]
tags: [files, loading, angle-brackets, globs, optional]
related: [file-loading-ast, file-loading-metadata, variables-basics]
related-code: [interpreter/eval/content-loader.ts, grammar/patterns/alligator.peggy]
updated: 2026-02-16
qa_tier: 1
---

```mlld
>> Basic loading
var @content = <README.md>
var @config = <config.json>          >> auto-parsed as object
var @events = <events.jsonl>         >> auto-parsed as array of JSON objects
var @author = <package.json>.author  >> field access
show @events[0].event                >> first JSONL record

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

**Optional load** - returns null for missing files, empty array for empty globs:

```mlld
>> Missing file returns null
var @optional = <config.json>?
when @optional => show "Config loaded"

>> Empty glob returns []
var @matches = <*.nonexistent>?
show @matches.length                 >> 0

>> Existing file works normally
var @readme = <README.md>?
show @readme                         >> file content
```
