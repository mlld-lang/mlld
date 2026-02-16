---
id: gotchas
title: Common Gotchas
brief: Traps that catch newcomers to mlld
category: mistakes
tags: [gotchas, pitfalls, var, let, if, when, cmd, sh, comments, labels]
related: [intro, var-in-parallel-block, complex-logic, slash-in-strict-mode]
updated: 2026-02-15
qa_tier: 1
---

Things that catch you by surprise.

## `var` vs `let`

`var` is module-level, immutable. `let` is block-scoped, mutable. `var` inside blocks is a parse error.

```mlld
var @config = "global"
if true [
  let @temp = "local"
  let @temp = "reassigned"     >> ok — let is mutable
]
```

## Comments are `>>`

```mlld
>> This is a comment
var @x = 1    >> inline comment
```

`//` doesn't exist in mlld.

## `cmd` vs `sh`

`cmd` interpolates `@variables`. Pipes work, but `>`, `&&`, `;`, `2>/dev/null` are rejected. Use `sh` for full shell syntax.

```mlld
exe @list(dir) = cmd { ls -la "@dir" | head -5 }
exe @count(dir) = sh { ls "$dir" 2>/dev/null | wc -l }
```

Use native variable syntax in `js`, `node`, `sh`, `py` blocks — pass mlld values as parameters.

## `if` vs `when`

```
if @cond [block]                 Run block if true
when @cond => value              Select first match
when [cond => val; * => default] First-match list
when @val ["a" => x; * => y]    Match value against patterns
```

`if` runs blocks (side effects). `when` returns values (expressions). Don't mix them up.

## Labels are comma-separated

```mlld
var secret,pii @data = "sensitive"     >> correct
var secret pii @data = "sensitive"     >> parse error
```

## Angle brackets trigger file loading

```mlld
var @readme = <README.md>
var @html = `<div>Hello</div>`         >> tries to load "div"!
```

Use `.att` template files for HTML content.

## Path dot escaping

`@var.json` is field access. Escape the dot for file extensions: `@name\.json`.

```mlld
let @out = `@dir/@name\.json`          >> correct
let @out = `@dir/@name.json`           >> accesses .json field
```

## Escaping `@`

`\@` produces a literal `@`: `user\@example.com` outputs `user@example.com`.

## Error handling in loops

Errors in `for` loops become data objects with `.error` and `.message` fields. The loop continues.

```mlld
var @results = for @item in @list [ => @process(@item) ]
var @failures = for @r in @results when @r.error => @r
```

## `show` and StructuredValues

`show @val` on a StructuredValue can dump internal metadata. Assign to a variable first.

```mlld
var @parsed = '{"a":1}' | @parse
var @clean = { result: @parsed }
show @clean
```

