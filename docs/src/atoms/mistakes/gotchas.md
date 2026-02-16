---
id: gotchas
title: Common Gotchas
brief: Traps that catch newcomers to mlld
category: mistakes
tags: [gotchas, pitfalls, var, let, if, when, cmd, sh, comments, labels]
related: [intro, mistake-var-in-parallel-block, mistake-complex-logic, mistake-slash-in-strict-mode]
updated: 2026-02-15
qa_tier: 1
---

mlld is not JavaScript/Python.

**Use `>>` for comments, not `//`**

Labels are comma-separated: `var secret,pii @data = "x"`

`var` is module-level and immutable, `let` is block-scoped and mutable
```mlld
var @config = "global"
if true [
  let @temp = "local"    >> correct
  var @temp = "local"    >> WRONG: var not allowed in blocks
]
```

`if` vs `when`
```
if @cond [block] else [block]                  >> Run block if true
when @cond => value                            >> Select first match
when [cond => val; * => default]               >> First-match list
when @val ["a" => x; * => y]                   >> Match value against patterns
```

`cmd` interpolates `@variables`. Pipes work, but `>`, `&&`, `;`, `2>/dev/null` are rejected. Use `sh` for full shell syntax.
```mlld
exe @safe() = cmd { ls -la }                   >> correct: simple command
exe @piped() = cmd { ls -la | head -5 }        >> correct: pipes work in cmd
exe @redirect() = cmd { ls > out.txt }         >> WRONG: cmd rejects >, &&, ;
exe @shell() = sh { ls > out.txt 2>/dev/null } >> correct: sh allows all shell syntax
```

Use native variable syntax in `js`, `node`, `sh`, `py` blocks — pass mlld values as parameters.

Angle brackets `<>` in templates and expressions
```mlld
var @html = `<div>Hello</div>`                 >> properly interprets as text bc no slashes/dots/vars
var @template = `File contents: <file.md>`     >> interpolates full content of file.md in template value
var @readme = <README.md>                      >> loads file
var @files = <src/**/*.ts>                     >> glob pattern
var @files = <@pathvar/file.ts>                >> variable usage
```
See `mlld howto file-loading-basics` for advanced usage.

`@var.json` is field access. Escape the dot for file extensions: `@name\.json`.

```mlld
let @out = `@dir/@name\.json`          >> correct
let @out = `@dir/@name.json`           >> accesses .json field
```

`\@` produces a literal `@`: `user\@example.com` outputs `user@example.com`.

Errors in `for parallel` loops become data objects with `.error` and `.message` fields. The loop continues. Regular (non-parallel) `for` loops throw on error.

```mlld
var @results = for parallel(4) @item in @list [ => @process(@item) ]
var @failures = for @r in @results when @r.error => @r
```

