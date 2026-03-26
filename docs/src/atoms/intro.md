---
id: intro
qa_tier: 1
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
mlld howto <keyword>       Search by keyword (searches tags, titles, briefs)
mlld howto grep <pattern>  Full-text search across all docs
mlld validate <dir>        Validate all mlld files in a directory (recommended)
mlld validate <file>       Validate a single file
```

---

mlld is an LLM scripting language for **surgical context assembly**, **token-efficient orchestration**, and **secure agent workflows**.

## What mlld Does

**1. Surgical Context Assembly**

Load exactly what you need, when you need it. Glob files, extract sections, filter by metadata, transform content — all with declarative syntax.

```mlld
var @relevantDocs = <docs/**/*.md # API, "SDK Usage"; !# Internal>
exe @releaseNotes(version) = <CHANGELOG.md # "[@version]" >
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
policy @p = {
  defaults: { rules: ["no-secret-exfil"], unlabeled: "untrusted" },
  labels: { secret: { deny: ["op:show", "exfil"] } }
}

var secret @data = <@private/customer-list.txt>
>> LLM can be tricked into trying to exfil @data
>> But label flow rules block it before execution
```

See `mlld howto security` for comprehensive prompt injection defense strategies.

## Richly featured, many examples

mlld is very full-featured for creating LLM workflows. It *should* be possible to do most things you'd want to do natively in mlld, but you can also fallback to python or javascript or shell scripts *inside* mlld.

Before using a js/python fallback, search the docs: mlld PROBABLY solved it already.

Use the `mlld` skill (installed with `mlld skill install`) and see the examples included with the skill.

## Two Syntax Modes

**.mld files (strict mode)** - Default for scripts
- Bare directives: `var @x = 1` (no slash prefix)
- Text lines are errors (catches accidental output)

**.md files (markdown mode)** - For literate scripts
- Slash prefix required for directives: `/var @x = 1`
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

**Directives** - Commands: `var`, `show`, `run`, `if`, `for`, `when`, `import`, `export`, `guard`, `policy`, `hook`, `checkpoint`

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

**Hooks** - Lifecycle observers: `hook after op:named:fn = [...]` for logging, telemetry, transforms

**Checkpoint** - Auto-caches `llm`-labeled exe results; `--resume` re-runs selectively

## Gotchas

### Coming from JS/Python

mlld is its own language — don't assume JS/Python syntax works. Common mistakes:

- **No `else if`** — use `when` for multi-branch matching, or nest `if` blocks: `if @a [...] else [ if @b [...] ]`
- **No array spread in literals** — use `.concat()`: `var @combined = @arr1.concat(@arr2)`
- **No computed object keys** — use `js{}`: `exe @build(key, val) = js { return {[key]: val} }`
- **No methods on literals** — assign first: `var @s = "hello"` then `var @up = @s.toUpperCase()`
- **No standalone boolean flags** — use `--flag true` not `--flag` (all CLI payload flags need values)

mlld has familiar built-in JS methods. See `mlld howto builtins` for the full list.

Loaded files are rich objects, not strings. Frontmatter is already parsed (@file.mx.fm.title), metadata is available (@file.mx.tokens, @file.mx.filename). Check `mlld howto file-loading-metadata` before writing js/node blocks for file processing.

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

`var` can be labeled, `let` cannot be labeled. This is because labels get taint-tracked (taint tracking on a mutable object is a nightmare). Design your variable usage accordingly; use `exe` to create abstractions at top level which can also be labeled.

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

| Block | mlld vars | Native vars | Comments |
|------|-----------|-------------|----------|
| `cmd` | `@name` | n/a | mlld interpolation |
| `sh` | not available | `$name` | exe params become shell vars |
| `js` | not available | `paramName` | exe params are JS locals |
| `py` | not available | `paramName` | exe params are Python locals |

Angle brackets `<>` in templates and expressions
```mlld
var @html = `<div>Hello</div>`                 >> properly interprets as text bc no slashes/dots/vars
var @template = `File contents: <file.md>`     >> interpolates full content of file.md in template value
var @readme = <README.md>                      >> loads file
var @files = <src/**/*.ts>                     >> glob pattern
var @files = <@pathvar/file.ts>                >> variable usage
```
`<@var>` always triggers file loading. For text output, use `@var` directly.

See `mlld howto file-loading-basics` for advanced usage.

**Hyphens are valid in identifiers**: `@prefix-alpha` is one variable name, not `@prefix` minus `alpha`. If you need subtraction, use spaces: `@a - @b`.

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

`@exists(@var)` checks if the *variable* is defined. `@fileExists(@var)` checks if the *file at that path* exists.

`[]` and `{}` are falsy in mlld 

**Reserved variables**: `@root`, `@base`, `@now`, `@input`, `@payload`, `@state`, `@debug`, `@keychain`, `@fm`, `@mx`, `@p`

**Built-in transformers** (pipes: `@data | name`): `@parse` (`.strict`, `.loose`, `.llm`, `.fromlist`), `@xml`, `@csv`, `@md`, `@upper`, `@lower`, `@trim`, `@pretty`, `@sort`

**Built-in functions**: `@exists(@var)`, `@fileExists(@path)`, `@typeof(@var)`

## Key Syntax

Common patterns for quick reference. See topic-specific `mlld howto` pages for details.

```mlld
>> Variables and templates
var @name = "Alice"
var @greeting = `Hello @name!`
var @list = ["a", "b", "c"]
var @obj = { key: "value", ...@other }

>> File loading
var @content = <README.md>              >> load file
var @optional = <config.json>?          >> null if missing
var @files = <src/**/*.ts>              >> glob (returns array)

>> Functions
exe @greet(name) = `Hello @name!`
exe @prompt(ctx) = template "prompt.att"
exe @run(dir) = cmd { ls @dir }
exe @check(path) = @exists(@path)

>> Method chains (see `mlld howto builtins`)
var @trimmed = @raw.trim().split("\n")
var @slug = @name.replaceAll("/", "-")
var @upper = @text.toLowerCase().startsWith("hello")

>> Parallel loops
var @results = for parallel(10) @file in @files [
  => @process(@file)
]

>> Pipes
var @data = @text | @parse              >> parse JSON
var @data = @text | @parse.llm          >> extract JSON from LLM output
```

**Path resolution**: `<@file>` resolves from the current script's directory, not the project root. Use `@root` for absolute paths: `<@root/@file>`. This matters when `cmd` output gives project-root-relative paths but your script is in a subdirectory.

## Built-ins at a Glance

**Reserved variables**: `@root`, `@base`, `@now`, `@input`, `@payload`, `@state`, `@debug`, `@keychain`, `@fm`, `@mx`, `@p`

**Transformers** (pipes: `@data | name`): `@parse` (`.strict`, `.loose`, `.llm`, `.fromlist`), `@xml`, `@csv`, `@md`, `@upper`, `@lower`, `@trim`, `@pretty`, `@sort`

**Functions** (call-style): `@exists(@var)`, `@fileExists(@path)`, `@typeof(@var)`

**Helpers**: `@keep`, `@keepStructured`

**String methods**: `.length`, `.includes()`, `.indexOf()`, `.startsWith()`, `.endsWith()`, `.toLowerCase()`, `.toUpperCase()`, `.trim()`, `.split()`, `.slice()`, `.substring()`, `.replace()`, `.replaceAll()`, `.match()`, `.padStart()`, `.padEnd()`, `.repeat()`

**Array methods**: `.length`, `.includes()`, `.indexOf()`, `.join()`, `.slice()`, `.concat()`, `.reverse()`, `.sort()`

**Type checks**: `.isArray()`, `.isObject()`, `.isString()`, `.isNumber()`, `.isBoolean()`, `.isNull()`, `.isDefined()`

See `mlld howto builtins` for full reference with examples.

## Next Steps

- `mlld howto syntax` — variables, templates, file loading
- `mlld howto control-flow` — if, when, for, foreach
- `mlld howto security` — labels, policies, guards
- `mlld howto modules` — import, export, organizing code
