---
id: mistake-file-vs-string
title: File vs String
brief: Angle brackets load content, quotes are literal
category: mistakes
parent: mistakes
tags: [mistakes, files, strings, syntax]
related: [file-loading-basics, variables-basics]
related-code: []
updated: 2026-01-05
---

**Angle brackets load content; quotes are literal strings:**

```mlld
var @content = <README.md>     >> loads file contents
var @path = "README.md"        >> literal string
```
