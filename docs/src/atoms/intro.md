---
id: intro
title: Introduction to mlld
brief: What mlld is, mental model, and key concepts
category: intro
tags: [overview, quickstart, mental-model, gotchas]
related: [gotchas, labels-overview, policies, guards-basics]
updated: 2026-02-15
---

## Essential Commands

```
mlld howto                 Browse all documentation topics
mlld howto grep <pattern>  Search docs for keywords
mlld howto gotchas         Common traps and pitfalls
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

var secret @apiKey = <@keychain/prod/api-key>
>> LLM can be tricked into trying to exfil @apiKey
>> But label flow rules block it before execution
```

The LLM can be manipulated. mlld prevents the consequences from manifesting.

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

## Mental Model

What mlld IS:
- A workflow orchestrator (like Make + npm for the AI era)
- Executable documentation (reads like a guide, runs like a script)
- A logical router (route data and actions based on conditions)

What mlld ISN'T:
- A template engine (not Jinja/Handlebars — it orchestrates LLMs that use templates)
- A shell script replacement (it calls shells; doesn't replace them)

Think Docker Compose or GitHub Actions: declare what happens, don't program how.

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

## Common Gotchas

These traps catch newcomers. Most stem from mlld intentionally differing from JavaScript/Python.

**Use `>>` for comments, not `//`**
```mlld
>> This is a comment
// WRONG: parse error
```

**Labels are comma-separated**
```mlld
var secret,pii @data = "x"     >> correct
var secret pii @data = "x"     >> WRONG: parse error
```

**`var` is module-level, `let` is block-scoped**
```mlld
var @config = "global"
if true [
  let @temp = "local"    >> correct
  var @temp = "local"    >> WRONG: var not allowed in blocks
]
```

**`if` runs blocks, `when` returns values**
```mlld
if @ready [ run @deploy() ]              >> correct (side effect)
var @msg = when [ @ok => "pass"; * => "fail" ]   >> correct (value)

when @ready => run @deploy()             >> WRONG: when returns, doesn't execute
exe @fn() = when [ @x => show "hi" ]     >> WRONG: show is side effect, not value
```

**`cmd` rejects shell operators — use `sh`**
```mlld
exe @safe() = cmd { ls -la }                   >> correct
exe @piped() = sh { ls | wc -l }               >> correct
exe @broken() = cmd { ls | wc -l }             >> WRONG: cmd rejects pipes
```

**Angle brackets `<>` trigger file loading**
```mlld
var @html = `<div>Hello</div>`     >> WRONG: tries to load file "div"
```

Use `.att` template files for HTML/XML content where `<tag>` doesn't trigger loading.

**See `mlld howto gotchas` for the full list.**

## Next Steps

- `mlld howto syntax` — variables, templates, file loading
- `mlld howto control-flow` — if, when, for, foreach
- `mlld howto security` — labels, policies, guards
- `mlld howto modules` — import, export, organizing code
- `mlld howto gotchas` — full list of common traps
