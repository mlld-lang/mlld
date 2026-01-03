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

Handle optional parameters with `when first`:

```mlld
exe @claude(prompt, model, tools) = when first [
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

exe @gate(response) = when first [
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
exe @checkLength(text) = when first [
  @text.length() > 10 => { pass: true }
  * => { pass: false, reason: "Too short" }
]

exe @checkFormat(text) = when first [
  @text.startsWith("Answer:") => { pass: true }
  * => { pass: false, reason: "Wrong format" }
]

exe @validate(text) = [
  let @len = @checkLength(@text)
  let @fmt = @checkFormat(@text)
  => when first [
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
  let @hasQuestion = @input.includes("?")

  let @base = when first [
    @length > 100 => 0.5
    @length > 50 => 0.3
    * => 0.1
  ]

  => when first [
    @hasQuestion => @base + 0.3
    * => @base
  ]
]

exe @route(input) = [
  let @s = @score(@input)
  => when first [
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

var @json = @reviews | @json
output @json to "reviews.json"
```

**Key patterns:**
- `<pattern>` - Glob file loading
- `@f.mx.relative` - File metadata access
- `output ... to "file"` - Write results

## Recipe 7: Retry with Hints

Pass context between retry attempts:

```mlld
exe @generate() = when first [
  @mx.try == 1 => @haiku("Write a haiku about code")
  * => @haiku("Write a haiku about code. Hint: @mx.hint")
]

exe @validate(text) = when first [
  @text.includes("code") => @text
  @mx.try < 3 => retry "Must mention 'code'"
  * => "Failed after 3 tries"
]

var @result = @generate() | @validate
show @result
```

The `retry "hint"` re-runs the previous stage with `@mx.hint` available.

## Common Patterns Summary

| Pattern | Use Case |
|---------|----------|
| `@input \| cmd { ... }` | Pipe to shell command |
| `cmd:@dir { ... }` | Run in directory |
| `exe @f(x) = [...]` | Multi-statement function |
| `when first [...]` | Switch/match logic |
| `for parallel(n) ...` | Concurrent processing |
| `\|\| @a \|\| @b` | Parallel pipeline group |
| `retry "hint"` | Retry with context |
| `{ ...@obj, key: val }` | Object spread |
| `@obj.mx.keys` | Get object keys |
