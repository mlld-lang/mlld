# Cookbook

Real-world patterns showing how mlld features work together. Each recipe solves a practical problem.

## Recipe 1: Calling LLMs

A utility module for invoking Claude models:

```mlld
exe @haiku(prompt) = @prompt | cmd { claude -p --model haiku }
exe @sonnet(prompt) = @prompt | cmd { claude -p --model sonnet }
exe @opus(prompt) = @prompt | cmd { claude -p --model opus }

show @haiku("Explain recursion in one sentence")
```

The pattern `@prompt | cmd { ... }` pipes input to the command via stdin.

### With Options

Handle optional parameters with `when`:

```mlld
exe @claude(prompt, model, tools) = when [
  @tools == "" => @prompt | cmd { claude -p --model @model --tools "" }
  @tools => @prompt | cmd { claude -p --model @model --allowedTools "@tools" }
  * => @prompt | cmd { claude -p --model @model }
]

show @claude("Hello", "haiku", "")
show @claude("Search for cats", "sonnet", "WebSearch")
show @claude("Write code", "opus", null)
```

### With Working Directory

Use `cmd:@dir` to run commands in a specific directory:

```mlld
var @projectDir = "/path/to/project"
exe @review(prompt) = @prompt | cmd:@projectDir { claude -p }

show @review("Review the code in this directory")
```

## Recipe 2: Validation Gates

A gate checks if something passes before proceeding. Use blocks for multi-step logic:

```mlld
exe @isValid(response) = [
  let @check = @haiku("Is this a real answer? Reply yes/no: @response")
  => @check.trim().toLowerCase().startsWith("yes")
]

exe @gate(response) = when [
  @isValid(@response) => { pass: true, value: @response }
  * => { pass: false, reason: "Failed validation" }
]

var @result = @gate("Here's a detailed explanation...")
show @result.pass
```

**Key patterns:**
- `exe @f(x) = [...]` - Block for multiple statements
- `let @var = ...` - Scoped variable inside block
- `=> value` - Return from block
- `{ pass: true }` - Structured return objects

### Chaining Gates

Compose multiple checks:

```mlld
exe @checkLength(text) = when [
  @text.length() > 10 => { pass: true }
  * => { pass: false, reason: "Too short" }
]

exe @checkFormat(text) = when [
  @text.startsWith("Answer:") => { pass: true }
  * => { pass: false, reason: "Wrong format" }
]

exe @validate(text) = [
  let @len = @checkLength(@text)
  let @fmt = @checkFormat(@text)
  => when [
    !@len.pass => @len
    !@fmt.pass => @fmt
    * => { pass: true, value: @text }
  ]
]
```

## Recipe 3: Configuration Modules

Use frontmatter and templates for configurable modules:

```mlld
---
name: Support Bot
model: sonnet
---

var @config = {
  name: @fm.name,
  model: @fm.model,
  workDir: "/projects/support"
}

exe @systemPrompt(context) = template "./prompts/system.att"
exe @respond(message) = template "./prompts/respond.att"

export { @config, @systemPrompt, @respond }
```

Then import and use:

```mlld
import { @config, @respond } from "./support-bot.mld"

show @respond("How do I reset my password?")
```

**Key patterns:**
- `@fm.field` - Access frontmatter values
- `exe @f(x) = template "path"` - External template as function
- `export { ... }` - Explicit module API

## Recipe 4: Scoring and Routing

Route inputs based on calculated scores:

```mlld
var @THRESHOLD = 0.7

exe @score(input) = [
  let @length = @input.length()
  let @hasQuestion = @input.text.includes("?")

  let @scoreBase = when [
    @length > 100 => 0.5
    @length > 50 => 0.3
    * => 0.1
  ]

  => when [
    @hasQuestion => @scoreBase + 0.3
    * => @scoreBase
  ]
]

exe @route(input) = [
  let @s = @score(@input)
  => when [
    @s >= @THRESHOLD => { handler: "detailed", score: @s }
    @s >= 0.3 => { handler: "quick", score: @s }
    * => { handler: "ignore", score: @s }
  ]
]

var @decision = @route("What's the weather like today?")
show `Handler: @decision.handler (score: @decision.score)`
```

## Recipe 5: Parallel Processing

Process multiple items concurrently:

```mlld
var @prompts = [
  "Summarize: The quick brown fox",
  "Summarize: Hello world",
  "Summarize: Testing 123"
]

exe @summarize(text) = @haiku(@text)

var @results = for parallel(3) @p in @prompts => @summarize(@p)
show @results
```

The `parallel(3)` runs up to 3 at once. Results preserve input order.

### With Error Handling

Failed items don't stop the batch:

```mlld
for parallel(3) @task in @tasks [
  let @result = @process(@task)
  show `Done: @task.id`
]
show `Errors: @mx.errors.length`
```

Errors accumulate in `@mx.errors` for inspection after.

### Parallel Pipeline Groups

Run multiple functions on the same input:

```mlld
exe @analyze(text) = @haiku("Analyze: @text")
exe @summarize(text) = @haiku("Summarize: @text")
exe @keywords(text) = @haiku("Keywords: @text")

var @input = "Long document text here..."
var @results = || @analyze(@input) || @summarize(@input) || @keywords(@input)

show @results[0]
show @results[1]
show @results[2]
```

The `||` runs all three in parallel on the same input.

## Recipe 6: File Processing Pipeline

Load, transform, and output files:

```mlld
var @files = <src/**/*.ts>
exe @analyze(file) = @haiku("Review this code: @file")

var @reviews = for parallel(5) @f in @files => [
  let @review = @analyze(@f)
  => { file: @f.mx.relative, review: @review }
]

var @reviewsJson = @reviews | @parse
output @reviewsJson to "reviews.json"
```

**Key patterns:**
- `<pattern>` - Glob file loading
- `@f.mx.relative` - File metadata access
- `output ... to "file"` - Write results

## Recipe 7: Retry with Hints

Pass context between retry attempts:

```mlld
exe @generate() = when [
  @mx.try == 1 => @haiku("Write a haiku about code")
  * => @haiku("Write a haiku about code. Hint: @mx.hint")
]

exe @validate(text) = when [
  @text.includes("code") => @text
  @mx.try < 3 => retry "Must mention 'code'"
  * => "Failed after 3 tries"
]

var @result = @generate() | @validate
show @result
```

The `retry "hint"` re-runs the previous stage with `@mx.hint` available.

## Recipe 8: Codebase Audit

Review multiple files in parallel using Claude as a function:

```mlld
>> Claude model helper - haiku for fast, cheap reviews
exe @haiku(prompt) = @prompt | cmd { claude -p --model haiku --tools "" }

>> Build review prompt
exe @buildPrompt(filename, content) = `
Review this code for issues:
File: @filename
---
@content
---
List 2-3 issues or "LGTM". Be concise (max 3 lines).
`

>> Load TypeScript files
var @allFiles = <src/**/*.ts>

>> Review function
exe @reviewFile(file) = [
  let @prompt = @buildPrompt(@file.mx.relative, @file)
  let @review = @haiku(@prompt)
  let @trimmed = @review.trim()
  => { file: @file.mx.relative, review: @trimmed }
]

>> Parallel review - up to 5 concurrent
var @reviews = for parallel(5) @f in @allFiles => @reviewFile(@f)

>> Output results
for @r in @reviews [
  show `## @r.file`
  show @r.review
  show ""
]
```

**Key patterns:**
- `<src/**/*.ts>` - Glob pattern loads all matching files
- `@file.mx.relative` - Access file metadata (relative path)
- `@prompt | cmd { claude -p }` - Pipe to Claude CLI via stdin
- `for parallel(5)` - Process up to 5 files concurrently

## Recipe 9: Ralph Loop (Autonomous Agent)

The "Ralph" pattern runs an autonomous coding loop that loads fresh context each iteration, classifies the next task, executes it, and commits on success:

```mlld
import { @claude, @haiku } from "@lib/claude.mld"

>> Classify the most important task from a plan file
exe @classifyTask(plan) = [
  let @prompt = `Identify the SINGLE most important next task:
@plan
Return JSON: { "task": "...", "type": "implement|fix|test" }`
  => @haiku(@prompt) | @parse.llm
]

>> Build context (collect all specs)
exe @buildContext(task, specs) = [
  => { task: @task, specs: @specs }
]

>> Execute the task with full agent
exe @executeTask(task, context) = @claude(`
# Task: @task.task
# Specs: @context.specs.join("\n")
Implement this. Search before assuming not implemented.
`, "sonnet", ".", "Read,Edit,Write,Bash,Grep,Glob")

>> Validate with tests (returns exit code)
exe @validate() = cmd { npm test }

>> The loop
loop(endless) until @state.stop [
  let @plan = <fix_plan.md>
  when @plan.trim() == "" => done "complete"

  let @task = @classifyTask(@plan)
  let @context = @buildContext(@task, <specs/*.md>)
  let @result = @executeTask(@task, @context)
  let @check = @validate()

  when @check.exitCode == 0 => run cmd { git commit -am "fix" }
  continue
]
```

**Key patterns:**
- `loop(endless) until @state.stop` - Infinite loop with external stop signal
- `var @plan = <fix_plan.md>` - Reload fresh context each iteration
- `@haiku(@prompt) | @parse.llm` - Cheap model for classification
- `@claude(..., "sonnet", ".", "Read,Edit,...")` - Full agent with tools
- `@state.stop` - SDK can inject state to signal graceful shutdown

**Why it works:**
- Fresh context each iteration (no stale state)
- Dynamic context assembly (only load relevant specs)
- Tests as backpressure (only commit passing code)
- Deterministic logic, dynamic content

## Common Patterns Summary

| Pattern | Use Case |
|---------|----------|
| `@input \| cmd { ... }` | Pipe to shell command |
| `cmd:@dir { ... }` | Run in directory |
| `exe @f(x) = [...]` | Multi-statement function |
| `when [...]` | Switch/match logic |
| `for parallel(n) ...` | Concurrent processing |
| `\|\| @a \|\| @b` | Parallel pipeline group |
| `retry "hint"` | Retry with context |
| `{ ...@obj, key: val }` | Object spread |
| `@obj.mx.keys` | Get object keys |
| `loop(endless) until @state.stop` | Autonomous agent loop |
