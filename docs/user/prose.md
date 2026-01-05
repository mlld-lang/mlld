# Prose Execution

mlld supports prose execution - the ability to define executable functions that invoke a prose interpreter (like OpenProse) via an LLM.

## Syntax

```mlld
exe @function(params) = prose:@config { inline prose content }
exe @function(params) = prose:@config "path/to/file.prose"
exe @function(params) = prose:@config template "path/to/file.prose.att"
```

## Configuration

The config object specifies how prose is executed:

```mlld
var @config = {
  model: "claude-3-opus",     // LLM model to use
  skillName: "prose"          // interpreter skill (default: "prose" for OpenProse)
}
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | required | LLM model identifier |
| `skillName` | string | `"prose"` | Skill/interpreter to invoke |
| `skillPrompt` | string | auto-generated | Custom skill injection prompt |
| `skillPromptEnd` | string | auto-generated | Custom prompt suffix |
| `maxTokens` | number | - | Max response tokens |
| `temperature` | number | - | Model temperature |

## Interpreter Agnostic

mlld defaults to `skillName: "prose"` which invokes [OpenProse](https://openprose.org), but you can use any interpreter:

```mlld
// Default: OpenProse
var @openProse = { model: "claude-3", skillName: "prose" }

// Custom interpreter
var @myInterpreter = { model: "claude-3", skillName: "myDSL" }

// The skill injection prompt adapts to the skill name
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
// ATT template
exe @review(code) = prose:@config "./review.prose.att"

// MTT template
exe @review(code) = prose:@config "./review.prose.mtt"

// Explicit template keyword
exe @review(code) = prose:@config template "./review.prose.att"
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
run @summarize("Long text to summarize...")

// Or in pipelines
@document | @summarize() | @format()
```

## LLM Provider

Prose execution requires an LLM provider. Without one configured, mlld returns a placeholder showing the prose was parsed successfully:

```
[PROSE PARSED - No LLM provider configured]
Model: claude-3
Skill: prose
Content length: 549 chars
```

To enable actual execution, install an LLM provider module like `@mlld/claude`.

## Error Handling

If the LLM cannot process the prose (skill not available), it responds with:
```
ERROR: SKILL_NOT_FOUND: prose
```

mlld catches this and throws a descriptive error indicating which skill was not found.
