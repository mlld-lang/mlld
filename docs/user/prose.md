# Prose Execution

mlld supports prose execution - the ability to define executable functions that invoke a prose interpreter (like OpenProse) via an LLM.

## Syntax

```mlld
exe @function(params) = prose:@config { inline prose content }
exe @function(params) = prose:@config "path/to/file.prose"
exe @function(params) = prose:@config template "path/to/file.prose.att"
```

## Configuration

The config object specifies how prose is executed. The `model` field must be an executable (from `@mlld/claude`):

```mlld
import { @opus } from @mlld/claude

var @config = {
  model: @opus,
  skillName: "prose"
}
```

Or use pre-built configs from `@mlld/prose`:

```mlld
import { @opus } from @mlld/prose

exe @workflow(ctx) = prose:@opus {
  session "Process @ctx"
}
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | executable | required | Model executor (e.g., `@opus` from `@mlld/claude`) |
| `skillName` | string | `"prose"` | Skill/interpreter to invoke |
| `skillPrompt` | string | auto-generated | Custom skill injection prompt |
| `skillPromptEnd` | string | auto-generated | Custom prompt suffix |

## Interpreter Agnostic

mlld defaults to `skillName: "prose"` which invokes [OpenProse](https://openprose.org), but you can use any interpreter:

```mlld
import { @opus } from @mlld/claude

>> Default: OpenProse
var @openProse = { model: @opus, skillName: "prose" }

>> Custom interpreter (e.g., your own DSL)
var @myInterpreter = { model: @opus, skillName: "myDSL" }

>> The skill injection prompt adapts to the skill name
exe @analyze(data) = prose:@myInterpreter {
  process @data
  output result
}
```

When using a custom `skillName`, the generated prompt uses that name in the skill injection tags (e.g., `<MYDSL>...</MYDSL>`) and error messages.

## Content Sources

### Inline Content

```mlld
exe @summarize(text) = prose:@config {
  session "Summarize the following"
  input @text
  output summary
}
```

### File Reference

Plain `.prose` files are loaded and interpolated:

```mlld
exe @analyze(data) = prose:@config "./analysis.prose"
```

### Template Files

Use `.prose.att` (ATT-style `@var`) or `.prose.mtt` (Mustache-style `{{var}}`):

```mlld
import { @opus } from @mlld/claude
var @config = { model: @opus }

>> ATT template
exe @reviewAtt(code) = prose:@config "./review.prose.att"

>> MTT template
exe @reviewMtt(code) = prose:@config "./review.prose.mtt"

>> Explicit template keyword
exe @reviewExplicit(code) = prose:@config template "./review.prose.att"
```

**review.prose.att:**
```
session "Code Review"
input @code
context {
  reviewer: @reviewer
  style: @style
}
output review
```

**review.prose.mtt:**
```
session "Code Review"
input {{code}}
context {
  reviewer: {{reviewer}}
  style: {{style}}
}
output review
```

## Execution

Prose executables are invoked like any other mlld executable:

```mlld
import { @opus } from @mlld/claude
var @config = { model: @opus }
exe @summarize(text) = prose:@config { session "Summarize: @text" }

run @summarize("Long text to summarize...")
```

Prose executables can also be used in pipelines:

```mlld
import { @opus } from @mlld/claude
var @config = { model: @opus }
exe @summarize(text) = prose:@config { session "Summarize: @text" }
var @document = "This is a long document..."

show @document | @summarize()
```

## LLM Provider

Prose execution requires the `@mlld/claude` module (or similar) to provide the model executor. The executor calls Claude Code to run the prose through an LLM with the prose skill.

```mlld
>> Import the executor
import { @opus } from @mlld/claude

>> Use it in your config
var @config = { model: @opus }

>> Or use pre-built configs from @mlld/prose
import { @opus } from @mlld/prose
exe @task(ctx) = prose:@opus { session "Process @ctx" }
```

## Error Handling

If the LLM cannot process the prose (skill not available), it responds with:
```
ERROR: SKILL_NOT_FOUND: prose
```

mlld catches this and throws a descriptive error indicating which skill was not found.
