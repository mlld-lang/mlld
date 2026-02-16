---
id: intro
title: Introduction to mlld
brief: What mlld is, mental model, and key concepts
category: intro
tags: [overview, quickstart, mental-model, gotchas]
related: [gotchas, labels-overview, security-policies, security-guards-basics]
updated: 2026-02-15
---

## Essential Commands

```
mlld howto                 Browse all documentation topics
mlld howto grep <pattern>  Search docs for keywords
mlld validate <file>       Check syntax before running
```

---

mlld is an LLM scripting language for **surgical context assembly**, **token-efficient orchestration**, and **secure agent workflows**.

## What mlld Does

**1. Surgical Context Assembly**

Load exactly what you need, when you need it. Glob files, extract sections, filter by metadata, transform content — all with declarative syntax.

```mlld
var @relevantDocs = <docs/**/*.md>.section("API")
var @recentChanges = <CHANGELOG.md> | @lines | @first(10)
```

mlld makes context preparation explicit, reviewable, and reproducible.

**2. Token-Efficient Logic-Focused Orchestration**

Mix shell, JavaScript, Python, and prompts in a single script. Route data based on conditions. Parallelize LLM calls. Build orchestrators that are readable as documentation and executable as code.

```mlld
exe @reviewCode(file) = template "review.att"

var @files = <src/**/*.ts>
var @reviews = for parallel(10) @f in @files [
  => @reviewCode(@f.mx.relative)
]
```

Decision logic stays in your script. LLMs do what they're good at: reading, writing, analyzing. The orchestrator routes their work.

**3. Secure Agent Workflows**

Defend against prompt injection by enforcing what data can flow where, regardless of LLM intent. Labels track data provenance automatically. Policies block dangerous flows. Guards inspect and transform operations.

```mlld
var @policyConfig = {
  defaults: { rules: ["no-secret-exfil"], unlabeled: "untrusted" },
  labels: { secret: { deny: ["op:show", "exfil"] } }
}
policy @p = union(@policyConfig)

var secret @data = <@private/customer-list.txt>
>> LLM can be tricked into trying to exfil @data
>> But label flow rules block it before execution
```

See `mlld howto security` for comprehensive prompt injection defense strategies.

## Two Syntax Modes

**.mld files (strict mode)** - Default for scripts
- Bare directives: `var @x = 1` (no slash prefix)
- Text lines are errors (catches accidental output)

**.md files (markdown mode)** - For literate scripts
- Slash prefix required for directives: `/var @x = 1`
- Bare `=>` at line start returns from the script
- Text lines become content output

```mlld
>> Strict mode (.mld)
var @name = "Alice"
show `Hello @name!`

>> Markdown mode (.md) - same with slashes
/var @name = "Alice"
/show `Hello @name!`
```

## Key Concepts

**Directives** - Commands: `var`, `show`, `run`, `if`, `for`, `when`, `import`, `export`, `guard`, `policy`

**Variables** - Always `@` prefixed: `@name`, `@data`, `@result`

**Templates** - Backticks or triple-colons for interpolation

```mlld
var @greeting = `Hello @name!`
var @alt = ::Hello @name!::
```

**File loading** - Angle brackets load content: `<README.md>`, `<src/*.ts>`

**Pipelines** - Chain transformations: `@data | @parse | @validate`

**Executables** - Reusable functions: `exe @greet(name) = `Hello @name!``

**Modules** - Import/export: `import { @helper } from @corp/utils`

**Security** - Labels + policies + guards = prompt injection defense

## Gotchas

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

## Next Steps

- `mlld howto syntax` — variables, templates, file loading
- `mlld howto control-flow` — if, when, for, foreach
- `mlld howto security` — labels, policies, guards
- `mlld howto modules` — import, export, organizing code
- `mlld howto gotchas` — full list of common traps
