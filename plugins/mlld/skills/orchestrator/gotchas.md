# Orchestrator-Specific Gotchas

These are gotchas specific to orchestrator development. For general mlld gotchas, run `mlld howto intro` and `mlld howto gotchas`.

## File path resolution in orchestrators

`cmd` and `sh` blocks run at the **project root**. File loading with `<@file>` resolves from the **script's directory**. When your orchestrator lives in `llm/run/my-orch/` and uses `cmd { grep ... }` to find files, the paths will be project-root-relative (e.g. `services/lsp/foo.ts`). Loading them with `<@file>` will fail silently in `for parallel`.

```mlld
>> BAD: <@file> resolves from llm/run/my-orch/, not project root
var @raw = cmd { grep -rl "pattern" src --include="*.ts" }
var @files = @raw.trim().split("\n")
for parallel(10) @file in @files [
  let @content = <@file>             >> ERROR: looks for llm/run/my-orch/src/...
]

>> GOOD: use @root to anchor to project root
for parallel(10) @file in @files [
  let @content = <@root/@file>       >> correct: resolves from project root
]
```

## `@fileExists` is not a builtin

The idempotency pattern uses `@fileExists` which you must define yourself:

```mlld
exe @fileExists(path) = sh { test -f "$path" && echo "yes" || echo "no" }
```

Or use optional file loading as an alternative:
```mlld
let @existing = <@outPath>?
if @existing [
  show `  Skipped (exists): @outPath`
  => @existing | @parse
]
```

## Error handling in parallel loops

Errors in `for parallel` loops become data objects with `.error` and `.message` fields. The loop continues silently. If your loop body has a systemic bug (wrong paths, missing import), every iteration fails but the script appears to succeed.

Always check results:
```mlld
var @results = for parallel(20) @item in @items [ => @process(@item) ]
var @failures = for @r in @results when @r.error => @r
if @failures.length > 0 [
  show `@failures.length failures out of @results.length`
]
```
