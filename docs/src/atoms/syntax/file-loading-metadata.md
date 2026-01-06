---
id: file-loading-metadata
title: File Metadata
brief: Access file metadata via .mx
category: syntax
parent: file-loading
tags: [files, metadata, frontmatter]
related: [file-loading-basics, file-loading-globs]
related-code: [interpreter/eval/file-loading.ts, core/file-system/metadata.ts]
updated: 2026-01-05
---

**Metadata fields** (via `.mx`):

```mlld
var @file = <README.md>
show @file.mx.filename     >> "README.md"
show @file.mx.relative     >> relative path
show @file.mx.tokens       >> token count estimate
show @file.mx.fm.title     >> frontmatter field
```
