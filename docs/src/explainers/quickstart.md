---
layout: docs.njk
title: "Quick Start"
type: explainer
order: 2
---

# Quick Start

Get running with mlld in 5 minutes.

## Install

```bash
npm install -g mlld
```

## Set Up Your Tools

Install the mlld skill so your LLM coding assistant can help you write mlld:

```bash
mlld skill install
```

This gives Claude Code (and other supported tools) the ability to understand mlld syntax, generate scripts, and help you debug.

Two other commands you'll use constantly:

```bash
mlld howto <keyword>       # Search docs by keyword (fuzzy matches titles, tags, content)
mlld validate <file|dir>   # Instant syntax check — catches errors before you run
```

`mlld howto` is your go-to reference. Try `mlld howto import`, `mlld howto for`, `mlld howto security` — it covers everything.

## Your First Script

Create `hello.mld`:

```mlld
var @name = "World"
show `Hello, @name!`
```

Run it:

```bash
mlld hello.mld
```

Output:
```
Hello, World!
```

That's it. `var` creates variables (always `@`-prefixed), backticks do string interpolation, `show` prints output.

## Load Files

Angle brackets load file contents:

```mlld
var @readme = <README.md>
var @config = <package.json>
show `Project: @config.name`
```

Globs load multiple files:

```mlld
var @docs = <src/**/*.ts>
show `Found @docs.length() files`
```

## Call an LLM

This is what mlld is for. Install the Claude module and call it:

```bash
mlld install @mlld/claude
```

```mlld
import { @haiku } from @mlld/claude

var @code = <src/app.ts>
var @review = @haiku(`Review this code for bugs:\n\n@code`)
show @review
```

`@haiku` and `@sonnet` are callable functions. You pass them a prompt, they return the response.

## Functions

Define reusable functions with `exe`:

```mlld
exe @greet(name) = `Hello, @name!`
exe @add(a, b) = js { return a + b }

show @greet("World")
show @add(2, 3)
```

Add the `llm` label to functions that call an LLM — this enables automatic caching and resume:

```mlld
import { @haiku } from @mlld/claude

exe llm @summarize(file) = @haiku(`Summarize in one sentence:\n\n@file`)
```

## Control Flow

Iterate with `for`, branch with `when`:

```mlld
var @names = ["Alice", "Bob", "Charlie"]
for @name in @names => show `Hello, @name!`

var @score = 85
when @score >= 90 => show "Excellent!"
when @score >= 70 => show "Good job!"
when @score < 70  => show "Keep trying!"
```

## Run Shell Commands

Execute shell commands and capture results:

```mlld
var @branch = run cmd {git branch --show-current}
show `On branch: @branch`

run sh {
  npm test && echo "Tests passed!" || echo "Tests failed!"
}
```

`cmd` for simple pipe-safe commands, `sh` for full shell scripts. Also `js`, `node`, and `py` for other languages.

## A Real Example

Put it together — summarize every TypeScript file in a project:

```mlld
import { @haiku } from @mlld/claude

exe llm @summarize(file) = @haiku(`Summarize in one sentence:\n\n@file`)

var @files = <src/*.ts>
var @summaries = for @f in @files [
  let @summary = @summarize(@f)
  => `- **@f.mx.filename**: @summary`
]
show @summaries.join("\n")
```

This loads every `.ts` file, sends each to an LLM, and collects the results. The `llm` label on `@summarize` means results are cached — rerun the script and only new/changed files get re-processed.

## Next Steps

You know enough to start building. When you need more:

```bash
mlld howto <keyword>       # Search any topic
mlld howto import          # Modules and imports
mlld howto security        # Prompt injection defense
mlld howto mcp             # MCP tool integration
mlld howto                 # Browse all topics
mlld validate .            # Validate your whole project
```

Run `mlld qs` anytime to see a condensed syntax reference.
