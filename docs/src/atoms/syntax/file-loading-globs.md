---
id: file-loading-globs
title: File Loading with Globs
brief: Load multiple files matching patterns
category: syntax
parent: file-loading
tags: [files, globs, patterns, arrays]
related: [file-loading-basics, file-loading-metadata]
related-code: [interpreter/eval/file-loading.ts, core/file-system/glob.ts]
updated: 2026-01-05
---

**Globs return arrays:**

```mlld
>> Basic glob
var @docs = <docs/**/*.md>
show @docs.length
for @doc in @docs => show @doc.mx.filename

>> With "as" template
var @toc = <docs/*.md> as "- [<>.mx.fm.title](<>.mx.relative)"
```
