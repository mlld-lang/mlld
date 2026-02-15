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

Things that will catch you by surprise. Most stem from mlld intentionally differing from JavaScript/Python conventions.

## Variable Scope

**`var` is module-level and immutable. `let` is block-scoped.**

```mlld
var @config = "global"         >> immutable, available everywhere

if true [
  let @temp = "local"          >> block-scoped, only exists here
  let @temp = "reassigned"     >> ok — let is mutable within its block
]
>> @temp is not accessible here
```

**Trap**: Using `var` inside blocks is a parse error. Use `let`.

## Comments

**Use `>>` for comments, not `//`.**

```mlld
>> This is a comment
var @x = 1    >> inline comment

// WRONG: This will fail to parse
```

JavaScript/Python developers instinctively use `//` — it doesn't exist in mlld.

## Shell Execution

**`cmd` for simple commands. `sh` for shell syntax.**

`cmd { }` interpolates `@variables` but rejects shell operators (`|`, `>`, `&&`, `;`, `2>/dev/null`).

```mlld
>> cmd: @variables interpolated directly, no shell operators
exe @list(dir) = cmd { ls -la "@dir" }

>> sh: $shell variables, supports pipes and redirection
exe @count(dir) = sh { ls "$dir" 2>/dev/null | wc -l }
```

**Trap**: Using `cmd { ls | wc -l }` or `cmd { echo "x" > file }` fails. Use `sh { }` instead.

## Conditionals: `if` vs `when`

**`if` runs blocks (side effects). `when` returns values (expressions).**

```mlld
>> if: side effects. No return value.
if @ready [
  run @deploy(@build)
  show `Deployed`
]

>> when: returns a value. No side effects.
var @status = when [
  @errors.length > 0 => "fail"
  @warnings.length > 0 => "warn"
  * => "pass"
]

>> when pattern match: compare against a value
var @msg = when @status [
  "fail" => "Build failed"
  "warn" => "Warnings found"
  * => "All clear"
]
```

**Common mistakes:**

```mlld
>> WRONG: show inside exe when (side effect in expression context)
exe @label(s) = when [
  @s == "pass" => show `OK`    >> ERROR: actions don't work here
  * => show `FAIL`
]

>> RIGHT: return a value, show it outside
exe @label(s) = when [ @s == "pass" => "OK"; * => "FAIL" ]
show @label(@status)

>> WRONG: using when for conditional execution
when @ready => run @deploy()   >> when returns, doesn't execute

>> RIGHT: use if for conditional execution
if @ready [ run @deploy() ]
```

**Rule**: `if` for side effects (show, run, output). `when` for values (strings, numbers, objects).

## Labels

**Labels are comma-separated, not space-separated.**

```mlld
var secret,pii @data = "sensitive"     >> correct
var secret pii @data = "sensitive"     >> WRONG: parse error
```

## File Loading

**Angle brackets `<>` always trigger file loading.**

```mlld
var @readme = <README.md>              >> loads file
var @files = <src/**/*.ts>             >> glob pattern
```

**Trap**: Writing HTML/XML in templates.

```mlld
>> WRONG: tries to load a file named "div"
var @html = `<div>Hello</div>`

>> RIGHT: use .att template files for HTML content
exe @page() = template "page.att"
```

For generating HTML with dynamic content, use `.att` template files where `<tag>` doesn't trigger file loading in static text.

## Path Escaping

**`@var.json` is field access, not a file extension.**

```mlld
let @outPath = `@runDir/review/@name\.json`   >> correct (escape the dot)
let @outPath = `@runDir/review/@name.json`    >> WRONG: accesses .json field
```

To build paths with extensions, escape the dot: `\.json`, `\.txt`, `\.md`.

## Escaping `@`

**Double it: `@@` produces a literal `@`.**

```mlld
show `Email: user@@example.com`        >> outputs "user@example.com"
show `Package: @@anthropic/sdk`        >> outputs "@anthropic/sdk"
```

## Error Handling in Loops

**Runtime errors in `for` loops become data objects.**

```mlld
var @results = for @item in @list [
  => @process(@item)    >> if @process throws, becomes {__error: true, __message: "..."}
]

>> Always check for errors
var @failures = for @r in @results when @r.__error => @r
if @failures.length > 0 [
  show `@failures.length items failed`
]
```

Loops don't throw — they package errors as data and continue. Check `.__error` after.

## Output Gotchas

**`show` on StructuredValues dumps metadata.**

```mlld
var @parsed = '{"a":1}' | @json

show @parsed              >> May dump: {type: "object", data: {...}, mx: {...}}
show { result: @parsed }  >> Clean: {"result":{"a":1}}
```

Wrap in an object for clean output.

## Complex Expressions

**Ternaries with `for` don't parse. Break into separate assignments.**

```mlld
>> WRONG: ternary with inline for fails to parse
var @filtered = @cond ? for @a in @list when @a > 1 => @a : @list

>> RIGHT: use exe with when
exe @filterItems(items, cond) = when [
  @cond => for @a in @items when @a > 1 => @a
  * => @items
]
var @filtered = @filterItems(@list, @cond)
```

## Reserved Names

Names like `@exists`, `@upper`, `@debug`, `@base`, `@root`, `@now`, `@json`, `@input`, `@keychain`, and all transformer names (`@lower`, `@trim`, `@split`, `@keys`, etc.) are reserved.

**Trap**: Using `@exists` as a variable name.

```mlld
var @exists = true        >> ERROR: collides with builtin @exists()
var @fileCheck = true     >> correct
```

Run `mlld validate` before executing — it catches name collisions.
