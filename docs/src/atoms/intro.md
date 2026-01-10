---
id: intro
title: Introduction to mlld
brief: What mlld is, mental model, and key concepts
category: intro
tags: [overview, quickstart, mental-model]
updated: 2026-01-10
---

## Essential Commands

```
mlld howto                 Browse all documentation topics
mlld howto grep <pattern>  Search docs for keywords
mlld validate <file>       Check syntax before running
```

---

mlld is an LLM scripting language for surgical context assembly, parallelization, and secure, deterministic orchestration.

## Two Syntax Modes

**.mld files (strict mode)** - Default for scripts
- Bare directives: `var @x = 1` (no slash prefix)
- Text lines are errors (catches accidental output)

**.md files (markdown mode)** - For literate scripts
- Slash prefix required: `/var @x = 1`
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
- A template engine (not Jinja/Handlebars)
- A shell script replacement (it orchestrates shells; doesn't replace them)

Think Docker Compose or GitHub Actions: declare what happens, don't program how.

## Key Concepts

**Directives** - Commands: `var`, `show`, `run`, `for`, `when`, `import`, `export`

**Variables** - Always `@` prefixed: `@name`, `@data`, `@result`

**Templates** - Backticks or `::...::` for interpolation: `` `Hello @name` ``

**File loading** - Angle brackets load content: `<README.md>`, `<src/*.ts>`

**Pipelines** - Chain transformations: `@data | @json | @validate`

**Executables** - Reusable functions: `exe @greet(name) = `Hello @name!``

**Modules** - Import/export: `import { @helper } from @corp/utils`
