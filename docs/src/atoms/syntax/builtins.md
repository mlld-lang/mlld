---
id: builtins
title: Built-in Reference
brief: Variables, transformers, methods, effects
category: syntax
tags: [builtins, variables, methods, transformers, reference]
related: [reserved-variables, methods-builtin, pipelines-basics]
related-code: [interpreter/builtin/transformers.ts, interpreter/eval/exec/builtins.ts, interpreter/env/Environment.ts]
updated: 2026-02-18
---

## Reserved Variables

- `@root` / `@base` - project root path
- `@now` - current ISO timestamp
- `@input` - stdin/env (must be allowed in config)
- `@payload` - data passed via SDK or CLI
- `@state` - mutable state for SDK integrations
- `@debug` - environment info
- `@fm` - current file's frontmatter (in modules)
- `@mx` - metadata accessor (labels, taint, guard context)

## Transformers (pipe stages)

Used with `|` in pipelines. Each receives the previous value.

- `@parse` - parse JSON (default mode)
- `@parse.strict` - strict JSON only
- `@parse.loose` - single quotes, trailing commas
- `@parse.llm` - extract JSON from LLM response text
- `@xml` - parse XML
- `@csv` - parse CSV
- `@md` - parse markdown
- `@upper` - uppercase string
- `@lower` - lowercase string
- `@trim` - strip whitespace
- `@pretty` - pretty-print JSON
- `@sort` - sort array

```mlld
var @users = cmd { cat users.json } | @parse
var @extracted = @llmResponse | @parse.llm
var @clean = @raw | @trim | @lower
```

## Checks

- `@exists(target)` - returns `true`/`false`. Works with file paths, variables, object fields, array indices, and globs. Note: `@exists(@var)` checks if the *variable* is defined, not if a file at that path exists.
- `@fileExists(path)` - returns `true`/`false`. Always resolves argument to a path string, then checks filesystem. Unlike `@exists(@var)`, `@fileExists(@var)` resolves the variable and checks the *file*.
- `@typeof(value)` - returns type as string

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

## Effects

- `show <value>` - output to stdout
- `output <value> to "<path>"` - write JSON to file
- `append <value> to "<path>"` - append JSON line to file
- `@log(message)` - log message (when logging enabled)

## Helpers

- `@keep(obj, [...keys])` - keep only specified keys from object
- `@keepStructured(obj, schema)` - keep keys matching a schema structure

## String Methods

- `.length` - string length
- `.includes(sub)` - true if contains substring
- `.indexOf(sub)` - index or -1
- `.startsWith(prefix)` / `.endsWith(suffix)`
- `.toLowerCase()` / `.toUpperCase()`
- `.trim()` - remove whitespace
- `.split(separator)` - split to array
- `.slice(start, end?)` - extract substring by position
- `.substring(start, end?)` - extract substring (no negative indices)
- `.replace(search, replacement)` - replace first match
- `.replaceAll(search, replacement)` - replace all matches
- `.replaceAll({"old": "new", ...})` - bulk replacement via object map
- `.match(pattern)` - match against string or regex
- `.padStart(length, char?)` / `.padEnd(length, char?)`
- `.repeat(count)` - repeat N times

## Array Methods

- `.length` - array length
- `.includes(value)` - true if contains value
- `.indexOf(value)` - index or -1
- `.join(separator)` - join to string
- `.slice(start, end?)` - extract sub-array
- `.concat(other)` - combine arrays
- `.reverse()` - reverse order (new array)
- `.sort()` - sort alphabetically (new array)

## Type Checks

- `.isArray()` / `.isObject()` / `.isString()`
- `.isNumber()` / `.isBoolean()` / `.isNull()` / `.isDefined()`

```mlld
>> Method chaining
var @slug = @name.trim().toLowerCase().replaceAll(" ", "-")
var @items = @csv.split("\n").slice(1)

>> Multiline chaining
exe @normalize(text) = @text
  .trim()
  .toLowerCase()
  .replace("hello", "hi")
```

See `mlld howto methods-builtin` for detailed method docs with examples.
