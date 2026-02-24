---
id: file-loading-metadata
title: File Metadata
brief: Access file metadata via .mx
category: syntax
parent: file-loading
tags: [files, metadata, frontmatter]
related: [file-loading-basics, file-loading-ast]
related-code: [interpreter/eval/file-loading.ts, core/file-system/metadata.ts]
updated: 2026-02-24
qa_tier: 2
---

**Metadata fields** (via `.mx`):

```mlld
var @file = <README.md>
show @file.mx.filename      >> "README.md"
show @file.mx.relative      >> relative path from cwd
show @file.mx.absolute      >> absolute path
show @file.mx.path          >> alias for absolute path
show @file.mx.dirname       >> parent directory name
show @file.mx.relativeDir   >> relative path to directory
show @file.mx.absoluteDir   >> absolute path to directory
show @file.mx.tokens        >> token count estimate
show @file.mx.fm.title      >> frontmatter field
show @file.mx.text          >> raw text representation
show @file.mx.data          >> parsed data representation
```

For structured values, dotted field access resolves through `.mx.data`:
- `@file.title` is equivalent to `@file.mx.data.title`.
- Use `.mx.text` and `.mx.data` when you need explicit control.
- If payload data has an `mx` key, access it with `@file.mx.data.mx`.

**In loops** - metadata works directly:

```mlld
var @files = <docs/*.md>
for @file in @files => show @file.mx.filename
for @file in @files => show @file.mx.data.status
```
