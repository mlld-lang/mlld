---
id: builtins-checks
qa_tier: 1
title: Checks
brief: Existence checks, type checks, and type info
category: core
parent: builtins
tags: [builtins, exists, fileExists, typeof, typeInfo]
related: [builtins-reserved-variables, builtins-transformers, variables-truthiness]
related-code: [interpreter/eval/exec/builtins.ts]
updated: 2026-02-24
---

- `@exists(target)` - returns `true`/`false`. Works with file paths, variables, object fields, array indices, and globs. Note: `@exists(@var)` checks if the *variable* is defined, not if a file at that path exists.
- `@fileExists(path)` - returns `true`/`false`. Always resolves argument to a path string, then checks filesystem. Unlike `@exists(@var)`, `@fileExists(@var)` resolves the variable and checks the *file*.
- `@typeof(value)` - returns type as string
- `@typeInfo(value)` - returns rich type/provenance details for debugging

```mlld
>> File existence (literal paths)
if @exists("config.json") [ show "config found" ]
if @exists(<src/**/*.ts>) [ show "has ts files" ]

>> Variable/field existence
if @exists(@obj.field) [ show "field defined" ]
if @exists(@arr[5]) [ show "index 5 exists" ]

>> File existence with dynamic paths
var @configPath = "config.json"
if @fileExists(@configPath) [ show "config found" ]
if @fileExists(@settings.configPath) [ show "found" ]
```

## Type Checks

- `.isArray()` / `.isObject()` / `.isString()`
- `.isNumber()` / `.isBoolean()` / `.isNull()` / `.isDefined()`
