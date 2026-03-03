---
name: mlld:fanout
description: On-the-fly parallel LLM processing with mlld. When you need to process many files, records, or items with LLM analysis (more than ~5), compose a mlld script and execute it with `mlld -e` instead of doing things one at a time.
---

## When to use this

You're facing a task that involves LLM analysis of **many items** — files, DB records, API results, log entries. Instead of calling tools in a loop, compose a mlld script that fans out in parallel.

Trigger: "I need to [review/audit/analyze/investigate] [many things]"

For persistent, multi-phase orchestrators with checkpoints and adversarial validation, see `/mlld:orchestrator`. This skill is for quick, disposable scripts composed and run on the fly.

## Mechanics

1. Compose the script as a string
2. Validate with the `mlld_validate` tool (pass the code string) — fix any errors before running
3. Execute with `mlld -e '<script>'`
4. Results come back as structured JSON on stdout

If the `mlld_validate` MCP tool isn't available, write the script to `tmp/taskname.mld` and validate with `mlld validate tmp/taskname.mld` before running with `mlld tmp/taskname.mld`.

When the script contains single quotes (which conflict with the shell wrapper), write to `tmp/` instead of using `mlld -e`.

## Essential syntax

```mlld
var @files = <src/**/*.ts>                         >> glob (array)
var @data = <config.json> | @parse                 >> load + parse JSON
var @tree = cmd { tree --gitignore src/ }           >> shell command

exe @claude(prompt) = cmd { claude -p "@prompt" }   >> LLM call
exe @haiku(prompt) = cmd {                          >> cheap model
  claude -p "@prompt" --model haiku
}

var @results = for parallel(8) @item in @items [    >> concurrent work
  log `Processing @item.mx.relative...`             >> progress
  => @claude(@prompt) | @parse.llm                  >> extract JSON from LLM
]

output @results to "tmp/results.json"               >> save
show @results                                       >> stdout
```

## Patterns

### Fan-out: process every item in parallel

```mlld
var @files = <src/**/*.ts>
exe @claude(prompt) = cmd { claude -p "@prompt" }

exe @review(file) = ::
Review this file for issues:
<file path="@file.mx.relative">
@file
</file>
Return JSON: { "file": "...", "issues": [], "severity": "..." }
::

var @results = for parallel(8) @file in @files [
  log `Reviewing @file.mx.relative...`
  => @claude(@review(@file)) | @parse.llm
]

show @results
```

### Filter then fan-out: narrow down first, go deep on what matters

```mlld
var @tree = cmd { tree --gitignore src/ }
exe @claude(prompt) = cmd { claude -p "@prompt" }

var @targets = @claude(`Which of these files handle auth?
@tree
Return JSON: array of file paths`) | @parse.llm

var @files = for @path in @targets => <@path>

var @results = for parallel(4) @f in @files [
  => @claude(`Audit for vulnerabilities:
  <file path="@f.mx.relative">@f</file>
  JSON: { file, findings[] }`) | @parse.llm
]

show @results
```

### Query then fan-out: LLM writes SQL, code executes, parallel research

```mlld
var @schema = cmd { sqlite3 app.db ".schema" }
exe @claude(prompt) = cmd { claude -p "@prompt" }

var @q = @claude(`Write a SQLite query for: @question
<schema>@schema</schema>
JSON: { sql, rationale }`) | @parse.llm

var @hits = cmd { sqlite3 -json app.db "@q.sql" } | @parse

var @results = for parallel(4) @row in @hits [
  => @claude(`Analyze: @row
  JSON: { id, assessment, recommendation }`) | @parse.llm
]

show @results
```

### Plan → research → synthesize: full decomposition

```mlld
var @tree = cmd { tree --gitignore src/ }
exe @claude(prompt) = cmd { claude -p "@prompt" }

var @plan = @claude(`Plan how to investigate: @question
@tree
JSON: { tasks: [{ name, files[], goal }] }`) | @parse.llm

var @research = for parallel(4) @task in @plan.tasks [
  let @content = for @f in @task.files => <@f>
  let @r = @claude(`@task.goal
  <files>@content</files>
  JSON: { task, findings[] }`) | @parse.llm
  log `Done: @task.name`
  => @r
]

var @report = @claude(`Synthesize:
@research
JSON report.`) | @parse.llm

show @report
```

## Gotchas

- `@parse.llm` extracts JSON from LLM responses (handles markdown fences). `@parse` for clean JSON.
- `cmd { }` allows pipes but not `&&`, `>`, `;` — use `sh { }` for full shell syntax.
- Escape dots in template paths: `` `tmp/file\.json` `` — unescaped `.json` is field access.
- `var` is top-level/immutable. `let` is block-scoped/mutable. Use `let` inside `for` blocks.
- `>>` for comments. Not `//`.
- `for parallel` errors become data objects with `.error` — the loop continues.
- Start with `parallel(4)`, increase for I/O-bound work.
- Always validate before executing — catch syntax errors before spending tokens on LLM calls.
- Ask the user to review the prompt before running if the task is expensive.
