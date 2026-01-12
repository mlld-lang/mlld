---
id: file-loading-metadata
title: File Metadata
brief: Access file metadata via .mx
category: syntax
parent: file-loading
tags: [files, metadata, frontmatter]
related: [file-loading-basics, file-loading-ast]
related-code: [interpreter/eval/file-loading.ts, core/file-system/metadata.ts]
updated: 2026-01-11
qa_tier: 2
---

**Metadata fields** (via `.mx`):

```mlld
var @file = <README.md>
show @file.mx.filename      >> "README.md"
show @file.mx.relative      >> relative path from cwd
show @file.mx.absolute      >> absolute path
show @file.mx.dirname       >> parent directory name
show @file.mx.relativeDir   >> relative path to directory
show @file.mx.absoluteDir   >> absolute path to directory
show @file.mx.tokens        >> token count estimate
show @file.mx.fm.title      >> frontmatter field
```

**In loops** - metadata works directly:

```mlld
var @files = <docs/*.md>
for @file in @files => show @file.mx.filename
for @file in @files => show @file.json.status
```
