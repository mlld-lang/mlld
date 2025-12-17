# mlld (pre-release)

A scripting language for LLM context engineering. Compose prompts from files, commands, and modules. Chain LLM calls with pipelines. Label sensitive data and define guards to control where it flows.

```bash
npm install -g mlld
```

[Give this to your LLM](https://mlld.ai/llms.txt) | [VSCode Extension](https://marketplace.visualstudio.com/items?itemName=andyet.mlld-vscode) | [Documentation](https://mlld.ai/docs)

## Quick Example

```mlld
/var @commits = run cmd {git log --since="yesterday" --oneline}
/var @prs = run cmd {gh pr list --json title,url}

/exe @claude(prompt) = run cmd {claude -p "@prompt"}

/var @summary = @claude(`
  Summarize my work from yesterday:

  Commits: @commits
  PRs: @prs
`)

/show @summary
```

## Why mlld?

- **Context composition** - Assemble prompts from files, commands, and modules
- **Pipelines** - Chain transformations with `|`, retry on validation failure
- **Iteration** - Process collections with `foreach` and `/for` (parallel supported)
- **Modules** - Share and version workflows like npm packages
- **Data boundaries** - Label sensitive data, define guards that block or transform it
- **CI-ready** - `mlldx` runs without filesystem persistence

## Core Syntax

```mlld
/var @name = "Alice"                           # Variables
/var @config = <config.json>                   # Load files with angle brackets
/var @output = run cmd {echo "hello"}          # Capture command output

/show `Hello @name!`                           # Output with interpolation
/log `Debug: @config.version`                  # Log to stderr

/exe @greet(name) = `Hello @name!`             # Define reusable functions
/exe @process(data) = js { return data.map(x => x * 2) }
/exe @fetch(url) = run cmd {curl -s "@url"}
```

### Imports

```mlld
/import { @helper, @util } from @alice/tools
/import { @config } from "./local-file.mld"
/import @company/prompts as @prompts

# Import types control caching behavior
/import module { @api } from @corp/sdk           # Offline after install
/import static { @template } from "./prompt.md"  # Embedded at parse time
/import live <https://api.io/status> as @status  # Fresh every execution
/import cached(1h) <https://feed.xml> as @feed   # Cached with TTL
```

### Conditionals

```mlld
# Simple condition
/when @debug => log "Debug mode"

# Define decision logic with /exe + when
/exe @grade(score) = when first [
  @score >= 90 => "A"
  @score >= 80 => "B"
  * => "C"
]
/show `Grade: @grade(91)`  # A

# Retry until valid
/exe @validate(input) = when first [
  @input.valid => @input
  @mx.try < 3 => retry "needs more detail"
  * => "fallback"
]

# Local variables in when blocks
/exe @format(score) = when first [
  let @grade = when first [@score >= 90 => "A" @score >= 80 => "B" * => "C"]
  * => `Score: @score (@grade)`
]

# Switch-style (first match wins)
/when first [
  @role == "admin" => show "Admin panel"
  @role == "user" => show "Dashboard"
  * => show "Login required"
]
```

### Iteration

```mlld
/var @files = ["a.md", "b.md", "c.md"]

# Execute for each
/for @file in @files => show `Processing @file`

# Collect results
/var @sizes = for @file in @files => run cmd {wc -c < @file}

# Parallel execution
/exe @review(file) = run cmd {claude -p "Review @file"}
/var @sources = <src/**/*.ts>
/for parallel @f in @sources => @review(@f)

# Transform with foreach
/exe @upper(s) = js { return s.toUpperCase() }
/var @caps = foreach @upper(@files)

# Batch pipeline - process collected results
/var @total = for @n in [1,2,3,4] => @n => | @sum
```

### Pipelines

```mlld
/var @result = run cmd {cat data.json} | @json | @transform | @validate

# Built-in transformers
/var @parsed = @input | @json              # Parse JSON (loose by default)
/var @strict = @input | @json.strict       # Strict JSON only
/var @extracted = @llmOutput | @json.llm   # Extract JSON from LLM response

# Parallel stages
/var @results = || @fetchA() || @fetchB() || @fetchC()

# Retry with hints
/exe @validate(input) = when [
  @input.valid => @input
  @mx.try < 3 => retry "needs more detail"
  * => "fallback"
]
```

### File Loading

```mlld
/var @readme = <README.md>                    # Load file contents
/var @config = <config.json>                  # JSON auto-parsed
/var @docs = <docs/*.md>                      # Glob patterns

# Field access
/var @version = <package.json>.version
/var @title = <post.md>.mx.fm.title          # Frontmatter access

# AST selectors (extract code definitions)
/var @func = <src/api.ts { createUser }>      # Specific function
/var @handlers = <src/*.ts { handle* }>       # Wildcard pattern
/var @allFuncs = <src/util.ts { *fn }>        # All functions
/var @names = <src/api.ts { ?? }>             # List all definition names
```

### Builtin Methods

```mlld
/var @list = ["apple", "banana", "cherry"]
/var @text = "Hello World"

/show @list.includes("banana")     # true
/show @list.join(", ")             # "apple, banana, cherry"
/show @text.toLowerCase()          # "hello world"
/show @text.split(" ")             # ["Hello", "World"]

# Type checking
/when @data.isArray() => show "It's an array"
/when @value.isDefined() => show "Value exists"
```

## Data Boundaries

Label data at creation. Labels propagate through all transformations - templates, pipelines, helper chains, field access. Guards see the labels and decide what's allowed.

```mlld
/var secret @apiKey = "sk-12345"
/var pii @email = "user@example.com"
/var untrusted @userInput = <form-data.txt>
```

### Guards Block Operations

```mlld
/guard before secret = when [
  @mx.op.type == "run" => deny "Secrets cannot be passed to shell"
  @mx.op.type == "show" => deny "Secrets cannot be displayed"
  * => allow
]

/var secret @key = "sk-12345"
/run cmd {echo @key}   # Blocked
/show @key             # Blocked
```

### Expression Tracking

Labels survive transformations. No bypass possible:

```mlld
/var untrusted @email = <inbox/message.txt>

/guard before untrusted = when [
  @mx.op.type == "run" => deny "Untrusted data blocked from shell"
  * => allow
]

/show @claude("Summarize: @email")          # Works - show is allowed
/run cmd {curl -d "@email.trim()" api.com}  # Blocked - .trim() doesn't remove label
```

### Guards Transform Data

Use `allow @value` to sanitize instead of blocking:

```mlld
/guard before secret = when [
  @mx.op.type == "show" => allow @input.slice(0, 4) + "****"
  * => allow
]

/var secret @key = "sk-12345-abcdef"
/show @key    # Shows "sk-1****"
```

### After Guards Validate Output

Validate and retry LLM responses:

```mlld
/guard after llmjson = when [
  @isValidJson(@output) => allow
  @mx.guard.try < 3 => retry "Response must be valid JSON"
  * => deny "Invalid JSON after 3 attempts"
]

/var llmjson @user = @claude("Generate a user object as JSON")
```

### Review Gate with Retry

Chain an LLM call through a review function that can retry with feedback:

```mlld
/exe @review(response, original) = when first [
  let @chat = "<user>@original</user><response>@response</response>"
  @claude("Is this response appropriate? YES or NO: @chat").includes("YES") => @response
  @mx.try < 3 => retry @claude("Provide feedback for improvement: @chat")
  * => "Response blocked by review"
]

/var @question = "How do I do X?"
/show @claude(@question) | @review(@question)
```

### Deny Handlers

Handle blocked operations gracefully instead of crashing:

```mlld
/exe @process(input) = when [
  denied => output "Blocked: @mx.guard.reason" to "audit.log"
  denied => show "Operation blocked by policy"
  * => run cmd {process @input}
]

/var secret @key = "abc"
/show @process(@key)   # Logs to audit.log, shows message, continues
```

## Streaming

```mlld
/exe @claude(prompt) = run cmd {claude -p "@prompt" --output-format=stream-json}
stream @claude("Tell me a story")

# Or directive form
/stream @generateReport()
```

## Modules

### Using Modules

```mlld
/import { @helper } from @alice/utils
/import { @helper } from @alice/utils@1.0.0     # Specific version
/import { @helper } from @alice/utils@beta      # Tagged version
```

### Creating Modules

```mlld
---
name: my-utils
author: alice
version: 1.0.0
about: Utility functions
needs: [js]
license: MIT
---

/exe @double(n) = js { return n * 2 }
/exe @greet(name) = `Hello @name!`

/export { @double, @greet }
```

### Module Commands

```bash
mlld install @alice/utils          # Install from registry
mlld update @alice/utils           # Update to latest
mlld outdated                      # Check for updates
mlld ls                            # List installed modules

mlld init                          # Create new module
mlld publish module.mld.md         # Publish to registry
mlld publish --tag beta            # Publish with tag
mlld publish --private             # Publish to private repo
```

## MCP Server

Expose mlld functions as MCP tools:

```bash
mlld mcp                           # Serve functions from llm/mcp/
mlld mcp --config tools.mld        # Use specific module
```

## CLI Reference

```bash
# Running files
mlld file.mld                      # Output to file.md
mlld file.mld --stdout             # Output to terminal
mlld file.mld --watch              # Auto-rerun on changes
mlld file.mld --env .env.local     # Load env file

# Scripts (from llm/run/ by default)
mlld run                           # List available scripts
mlld run deploy                    # Run deploy.mld

# Configuration
mlld setup                         # Interactive setup wizard
mlld alias --name lib --path ./src/lib

# CI/CD (ephemeral execution)
npx mlldx script.mld               # No filesystem persistence
```

## Learn More

- [Full Documentation](https://mlld.ai/docs)
- [Give this to your LLM](https://mlld.ai/llms.txt) - Comprehensive syntax reference
- [Examples](https://github.com/mlld-lang/mlld/tree/main/tests/cases/valid/feat)
