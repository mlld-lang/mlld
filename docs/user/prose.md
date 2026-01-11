# Prose Execution

mlld supports prose execution - the ability to define executable functions that invoke a prose interpreter (like OpenProse) via an LLM.

## Prerequisites

Prose execution requires:

1. **Claude Code** - The model executor uses `claude -p` to run prompts
2. **OpenProse plugin** - Install in Claude Code:
   ```
   /plugin marketplace add git@github.com:openprose/prose.git
   /plugin install open-prose@prose
   ```
3. **Restart Claude Code** and boot OpenProse with `/prose-boot`
4. **Skill approval** - Claude Code will prompt you to approve the OpenProse skills on first use

## Syntax

```mlld
exe @function(params) = prose:@config { inline prose content }
exe @function(params) = prose:@config "path/to/file.prose"
exe @function(params) = prose:@config template "path/to/file.prose.att"
```

## Quick Start

Use pre-built configs from `@mlld/prose`:

```mlld
import { @opus } from @mlld/prose

exe @workflow(ctx) = prose:@opus {
  session "Process @ctx"
}

run @workflow("some context")
```

OpenProse requires Opus - it's the only model that can reliably interpret the prose syntax.

## Configuration

The config object specifies how prose is executed:

```mlld
import { @claude } from @mlld/claude

>> Create a model executor
exe @opusModel(prompt) = @claude(@prompt, "opus", @base)

var @config = {
  model: @opusModel,
  skills: ["open-prose:prose-boot", "open-prose:prose-compile", "open-prose:prose-run"]
}
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | executable | required | Model executor (e.g., from `@mlld/claude`) |
| `skills` | array | OpenProse skills | Skills to invoke for prose execution |
| `skillPrompt` | string | auto-generated | Custom skill injection prompt |
| `skillPromptEnd` | string | auto-generated | Custom prompt suffix |

### Default Skills

When `skills` is not specified, mlld defaults to the OpenProse plugin skills:

```
open-prose:prose-boot
open-prose:prose-compile
open-prose:prose-run
```

## Custom Interpreters

You can use any interpreter by specifying different skills:

```mlld
import { @claude } from @mlld/claude

>> Create a model executor
exe @myModel(prompt) = @claude(@prompt, "opus", @base)

var @myInterpreter = {
  model: @myModel,
  skills: ["my-dsl:boot", "my-dsl:run"]
}

exe @analyze(data) = prose:@myInterpreter {
  process @data
  output result
}
```

## Content Sources

### Inline Content

Variables are interpolated using `@var` syntax:

```mlld
exe @summarize(text) = prose:@config {
  session "Summarize the following"
  input @text
  output summary
}
```

### File Reference

Plain `.prose` files are loaded as raw content (no interpolation):

```mlld
exe @analyze(data) = prose:@config "./analysis.prose"
```

### Template Files

Use `.prose.att` (ATT-style `@var`) or `.prose.mtt` (Mustache-style `{{var}}`):

```mlld
import { @opus } from @mlld/prose

exe @reviewAtt(code) = prose:@opus "./review.prose.att"
exe @reviewMtt(code) = prose:@opus "./review.prose.mtt"
```

**review.prose.att:**
```
session "Code Review"
input @code
output review
```

**review.prose.mtt:**
```
session "Code Review"
input {{code}}
output review
```

## Execution

Prose executables are invoked like any other mlld executable:

```mlld
import { @opus } from @mlld/prose

exe @summarize(text) = prose:@opus { session "Summarize: @text" }

run @summarize("Long text to summarize...")
```

Prose executables can also be used in pipelines:

```mlld
import { @opus } from @mlld/prose

exe @summarize(text) = prose:@opus { session "Summarize: @text" }
var @document = "This is a long document..."

show @document | @summarize()
```

## Error Handling

If the OpenProse skills are not available (not installed or not approved), mlld throws:

```
Prose execution failed: OpenProse skills not available.
Skills must be installed AND approved.
Required skills: open-prose:prose-boot, open-prose:prose-compile, open-prose:prose-run
```

To fix:
1. Add the plugin: `/plugin marketplace add git@github.com:openprose/prose.git`
2. Install it: `/plugin install open-prose@prose`
3. Restart Claude Code and run `/prose-boot`
4. Approve the skills when prompted
