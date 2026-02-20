# mlld (pre-release)

A scripting language for secure LLM orchestration. Compose prompts from files, commands, and modules. Chain LLM calls with pipelines. Label sensitive data and define guards to control where it flows.

```bash
npm install -g mlld
mlld howto intro      # give this to your llm
```

[VSCode Extension](https://marketplace.visualstudio.com/items?itemName=andyet.mlld-vscode) | [Documentation](https://mlld.ai/docs)

## Quick Example

```mlld
var @commits = run cmd {git log --since="yesterday" --oneline}
var @prs = run cmd {gh pr list --json title,url}

exe @claude(prompt) = run cmd {claude -p "@prompt"}

var @summary = @claude(`
  Summarize my work from yesterday:
  Commits: @commits
  PRs: @prs
`)

show @summary
```

## Why mlld?

- **Security** - Labels track data provenance, policies control what can happen, guards enforce at runtime
- **Context composition** - Assemble prompts from files, commands, and modules
- **Orchestration** - Create sophisticated resumable parallel orchestration loops 
- **Agents** - Build auditable, securable agents with far less code
- **Modules** - Share and version workflows and security policies like npm packages

## Core Syntax

```mlld
var @name = "Alice"                           # Variables
var @config = <config.json>                   # Load files with angle brackets
var @output = run cmd {echo "hello"}          # Capture command output

show `Hello @name!`                           # Output with interpolation
log `Debug: @config.version`                  # Log to stderr

exe @greet(name) = `Hello @name!`             # Define reusable functions
exe @process(data) = js { return data.map(x => x * 2) }
exe @fetch(url) = run cmd {curl -s "@url"}
```

### Imports

```mlld
import { @helper, @util } from @alice/tools
import { @config } from "./local-file.mld"
import @company/prompts as @prompts

# Import types control caching behavior
import module { @api } from @corp/sdk           # Offline after install
import static { @template } from "./prompt.md"  # Embedded at parse time
import live <https://api.io/status> as @status  # Fresh every execution
import cached(1h) <https://feed.xml> as @feed   # Cached with TTL
```

### Conditionals

```mlld
# Imperative branching
if @isProd [
  show "Production mode"
] else [
  show "Local mode"
]

# Pattern matching (first match wins)
exe @grade(score) = when [
  @score >= 90 => "A"
  @score >= 80 => "B"
  * => "C"
]
show `Grade: @grade(91)`  # A

# Simple condition
when @debug => log "Debug mode"

# Retry until valid
exe @validate(input) = when [
  @input.valid => @input
  @mx.try < 3 => retry "needs more detail"
  * => "fallback"
]

# Switch-style
when [
  @role == "admin" => show "Admin panel"
  @role == "user" => show "Dashboard"
  * => show "Login required"
]
```

### Iteration

```mlld
var @files = ["a.md", "b.md", "c.md"]

# Execute for each
for @file in @files => show `Processing @file`

# Collect results
var @sizes = for @file in @files => run cmd {wc -c @file}

# Parallel execution
exe @review(file) = run cmd {claude -p "Review @file"}
var @sources = <src/**/*.ts>
for parallel @f in @sources => @review(@f)

# Transform with foreach
exe @upper(s) = js { return s.toUpperCase() }
var @caps = foreach @upper(@files)

# Loop with done/continue control
var @result = loop(10) [
  let @count = (@input ?? 0) + 1
  when @count >= 3 => done @count
  continue @count
]

# Loop with until clause and pacing
loop(endless, 10ms) until @input >= 3 [
  let @next = (@input ?? 0) + 1
  continue @next
]

# While pipeline
var @countdown = @start | while(100) @decrement
```

### Pipelines

```mlld
var @result = run cmd {cat data.json} | @parse | @transform | @validate

# Built-in transformers
var @parsed = @input | @parse              # Parse JSON (loose by default)
var @strict = @input | @parse.strict       # Strict JSON only
var @extracted = @llmOutput | @parse.llm   # Extract JSON from LLM response

# Parallel stages
var @results = || @fetchA() || @fetchB() || @fetchC()
```

### File Loading

```mlld
var @readme = <README.md>                    # Load file contents
var @config = <config.json>                  # JSON auto-parsed
var @docs = <docs/*.md>                      # Glob patterns
var @optional = <missing.md>?                # Null if missing

# Field access
var @version = <package.json>.version
var @title = <post.md>.mx.fm.title          # Frontmatter access

# AST selectors (extract code definitions)
var @func = <src/api.ts { createUser }>      # Specific function
var @handlers = <src/*.ts { handle* }>       # Wildcard pattern
var @allFuncs = <src/util.ts { *fn }>        # All functions
var @names = <src/api.ts { ?? }>             # List all definition names
```

### Builtin Methods

```mlld
var @list = ["apple", "banana", "cherry"]
var @text = "Hello World"

show @list.includes("banana")     # true
show @list.join(", ")             # "apple, banana, cherry"
show @text.toLowerCase()          # "hello world"
show @text.split(" ")             # ["Hello", "World"]

# Template interpolation shortcuts
show `Hello @name??"stranger"!`   # Nullish fallback
show `Items: @count?`             # Omit if falsy

# Type checking
when @data.isArray() => show "It's an array"
when @value.isDefined() => show "Value exists"
```

### Payload

Pass data to scripts via CLI flags or SDK:

```mlld
import { topic, count } from @payload
show `Topic: @topic, Count: @count`
```

```bash
mlld run myscript --topic foo --count 5
mlld script.mld --topic foo --count 5
```

## Security and Prompt Injection Defense

mlld accepts that LLMs can be tricked by prompt injection. Instead of trying to make LLMs resistant to attacks, it gives you the tools to prevent the *consequences* from manifesting. Every operation the LLM attempts passes through an execution layer the LLM cannot circumvent.

### Labels and Taint Propagation

Every value carries metadata about what it is and where it came from. Labels propagate through all transformations — templates, pipelines, method chains, field access. No bypass through encoding or splitting.

```mlld
var secret @apiKey = "sk-12345"
var pii @email = "user@example.com"
var untrusted @userInput = <form-data.txt>
```

Source labels are applied automatically — MCP tool outputs carry `src:mcp`, command outputs carry `src:exec`, file content carries `src:file`. An attacker who base64-encodes a secret, splits it into chunks, and tries to exfiltrate each chunk finds that every chunk still carries the `secret` label. Labels track identity through transformations, not content patterns.

### Policies

Policies declare what should and shouldn't happen through classification:

```mlld
var @config = {
  defaults: {
    unlabeled: "untrusted",
    rules: [
      "no-secret-exfil",
      "no-sensitive-exfil",
      "no-untrusted-destructive",
      "no-untrusted-privileged"
    ],
    autosign: ["templates"],
    autoverify: true
  },
  operations: {
    "net:w": "exfil",
    "fs:w": "destructive"
  },
  capabilities: {
    allow: ["cmd:git:*", "cmd:npm:*"],
    deny: ["sh"]
  }
}
policy @p = union(@config)
```

`defaults.rules` enables named rules that block dangerous label-to-operation flows. `operations` maps semantic exe labels to risk categories — you label functions with what they do, and policy classifies those as risk types. `capabilities` controls what operations can run at all; even if an LLM is tricked into attempting `rm -rf /`, the capability check blocks it.

### Guards

Guards manage the flow of data and can transform/sanitize:

```mlld
# Block secrets from shell and display
guard before secret = when [
  @mx.op.type == "run" => deny "Secrets cannot be passed to shell"
  @mx.op.type == "show" => deny "Secrets cannot be displayed"
  * => allow
]

# Transform instead of blocking — redact for display
guard before secret = when [
  @mx.op.type == "show" => allow @input.slice(0, 4) + "****"
  * => allow
]

# Validate and retry LLM responses
guard after llmjson = when [
  @isValidJson(@output) => allow
  @mx.guard.try < 3 => retry "Response must be valid JSON"
  * => deny "Invalid JSON after 3 attempts"
]
```

After guards validate output:

```mlld
guard @validateMcp after src:mcp = when [
  @schema.valid(@output) => allow @output
  * => deny "Invalid schema"
]
```

Trust is asymmetric — anyone can mark data as untrusted, but only privileged guards can bless data as trusted. This mirrors real-world security: raising a concern is easy, clearing one requires authority.

### Sealed Credentials

Credentials flow directly from the OS keychain to environment variables through paths defined in policy, never becoming interpolatable values:

```mlld
run cmd { claude -p "@prompt" } using auth:claude
```

The secret is defined in policy (`auth.claude.from: "keychain:..."`) and injected as an env var at execution time. There is no `@apiKey` variable for the LLM to reference or exfiltrate.

### Environments

Scoped execution with OS-level isolation, credentials, and capability control:

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"], write: ["/tmp"] },
  net: "none",
  tools: ["Read", "Bash"],
  mcps: []
}

env @sandbox [
  run cmd { claude -p "Analyze the codebase" } using auth:claude
]
```

Child environments can only restrict their parent's capabilities, never extend them. Even if an LLM is tricked into executing arbitrary code, the damage is contained to the sandbox.

### Signing and Verification

Sign templates at authoring time to create a trust boundary between authentic instructions and untrusted data. The LLM verifies signatures at runtime and can distinguish developer-written instructions from injected content.

### Audit Ledger

Every security-relevant event is recorded in `.mlld/sec/audit.jsonl` — signing, verification, label changes, and file write taint. When labeled data is written to disk and read back, the audit ledger restores those labels, closing what would otherwise be an obvious evasion path.

### Deny Handlers

Handle blocked operations gracefully instead of crashing:

```mlld
exe @process(input) = when [
  denied => output "Blocked: @mx.guard.reason" to "audit.log"
  denied => show "Operation blocked by policy"
  * => run cmd {process @input}
]

var secret @key = "abc"
show @process(@key)   # Logs to audit.log, shows message, continues
```

## Hooks

User-defined before/after hooks on functions, operations, and data labels for observation and extensibility:

```mlld
hook before @myFunc = [
  log `Calling @mx.hook.target`
]

hook after op:for:iteration = [
  log `Iteration @mx.for.index of @mx.for.total`
]
```

## Modules

### Using Modules

```mlld
import { @helper } from @alice/utils
import { @helper } from @alice/utils@1.0.0     # Specific version
import { @helper } from @alice/utils@beta      # Tagged version
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

exe @double(n) = js { return n * 2 }
exe @greet(name) = `Hello @name!`

export { @double, @greet }
```

### Module Commands

```bash
mlld install @alice/utils          # Install from registry
mlld update @alice/utils           # Update to latest
mlld outdated                      # Check for updates
mlld ls                            # List installed modules

mlld module                        # Create new module
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

## Live RPC

Start the persistent NDJSON RPC transport over stdio:

```bash
mlld live --stdio
```

## Claude Code Plugin

Install the mlld plugin for Claude Code to get orchestrator authoring skills, starter scaffolding, and language server integration.

```bash
mlld plugin install
```

Includes:

- **Orchestrator skill** — patterns for audit, research, and development pipelines
- **Agent skill** — tool agents, event-driven agents, workflow agents
- **`/mlld:scaffold` command** — generate starter orchestrator projects from templates
- **Language server** — `.mld` syntax highlighting and diagnostics
- **MCP dev tools** — development-time tooling via `mlld mcp-dev`

## CLI Reference

```bash
# Running files
mlld file.mld                      # Output to file.md
mlld file.mld --stdout             # Output to terminal
mlld file.mld --watch              # Auto-rerun on changes
mlld file.mld --env .env.local     # Load env file
mlld file.mld --flag value         # Pass payload flags

# Scripts (from llm/run/ by default)
mlld run                           # List available scripts
mlld run deploy                    # Run deploy.mld
mlld run deploy --resume           # Resume from last checkpoint
mlld run deploy --fresh            # Ignore checkpoints
mlld run deploy --fork             # Branch from existing state

# Checkpoints
mlld checkpoint list               # View checkpoints
mlld checkpoint inspect <name>     # Inspect checkpoint details
mlld checkpoint clean              # Remove stale checkpoints

# Project setup
mlld init                          # Quick project setup
mlld module                        # Create new module
mlld validate                      # Check syntax and catch mistakes
mlld validate --error-on-warnings  # Exit 1 on warnings
mlld howto                         # Browse documentation topics

# Configuration
mlld setup                         # Interactive setup wizard
mlld alias --name lib --path ./src/lib

# CI/CD (ephemeral execution)
npx mlldx script.mld               # No filesystem persistence
```

## Learn More

- [Full Documentation](https://mlld.ai/docs)
