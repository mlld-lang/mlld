---
id: mistake-exists-vs-fileExists
title: "@exists vs @fileExists"
brief: "@exists checks variables, @fileExists checks the filesystem"
category: mistakes
parent: mistakes
tags: [mistakes, builtins, files, existence]
related: [builtins, file-loading-basics]
related-code: [interpreter/builtin/transformers.ts]
updated: 2026-02-19
---

`@exists(@var)` checks if the *variable* is defined — not whether a file exists. Use `@fileExists` for filesystem checks.

```mlld
var @outPath = "/tmp/results.json"

>> WRONG: checks if @outPath variable is defined (always true)
if @exists(@outPath) [ show "cached" ]

>> RIGHT: checks if the file at that path exists
if @fileExists(@outPath) [ show "cached" ]
```

`@exists` is for expression-level checks (variables, fields, globs):

```mlld
if @exists(@obj.field) [ show "field exists" ]
if @exists(<src/**/*.ts>) [ show "has ts files" ]
```

`@fileExists` always resolves its argument to a path string first, then checks the filesystem:

```mlld
var @cfg = "config.json"
if @fileExists(@cfg) [ show "config found" ]
```

For optional file loading (load if exists, null otherwise), use `<path>?`:

```mlld
var @cfg = <config.json>?
if @cfg [ show "loaded config" ]
```
