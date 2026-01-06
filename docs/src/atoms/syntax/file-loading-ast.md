---
id: file-loading-ast
title: AST Selection
brief: Extract code definitions from source files
category: syntax
parent: file-loading
tags: [files, ast, code-extraction, wildcards]
related: [file-loading-basics, file-loading-metadata]
related-code: [interpreter/eval/file-loading.ts, core/ast/ast-selector.ts]
updated: 2026-01-05
---

**AST Selection** (extract code from files):

```mlld
>> Exact names
var @handler = <src/api.ts { createUser }>

>> Wildcards
var @handlers = <api.ts { handle* }>         >> prefix match
var @validators = <api.ts { *Validator }>    >> suffix match

>> Type filters
var @funcs = <service.ts { *fn }>            >> all functions
var @classes = <service.ts { *class }>       >> all classes

>> Name listing (returns string arrays)
var @names = <api.ts { ?? }>                 >> all definition names
var @funcNames = <api.ts { fn?? }>           >> function names only
```

Supported: `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.go`, `.rs`, `.java`, `.rb`
Type keywords: `fn`, `var`, `class`, `interface`, `type`, `enum`, `struct`
