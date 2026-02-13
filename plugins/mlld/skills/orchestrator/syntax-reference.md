# mlld Syntax Reference for Orchestrators

Quick reference for the mlld syntax patterns used in orchestrators. For full language docs, run `mlld howto`.

## Imports

```mlld
import { @fn, @helper } from "./lib/module.mld"    >> Named imports
import { @claudePoll } from @mlld/claude-poll       >> Registry module
import "@payload" as @p                               >> CLI argument parsing
```

Arguments are accessed as `@p.argname` (from `--argname value` on CLI).

## Variables

```mlld
var @name = "value"                >> String
var @count = 42                    >> Number
var @list = [1, 2, 3]             >> Array
var @obj = { key: "value" }       >> Object
var @spread = { ...@obj, extra: 1 } >> Spread
```

## File Loading (Alligator Syntax)

```mlld
var @content = <path/to/file.md>       >> Load file (error if missing)
var @optional = <path/to/file.md>?     >> Load file (null if missing)
var @files = <src/**/*.ts>             >> Glob pattern (array of files)
```

Loaded files are StructuredValues with metadata: `@file.mx.filename`, `@file.length`, etc.

## Executables (Functions)

```mlld
exe @fn(a, b) = [block]                        >> Block form
exe @prompt(ctx, data) = template "./file.att"  >> Template (.att file)
exe @run(cmd) = cmd { shell command @cmd }      >> Shell command
exe @check(path) = sh { test -f "$path" && echo "yes" || echo "no" }  >> sh form
exe @calc(x) = js { return x * 2 }             >> Inline JavaScript
```

## Templates (.att files)

Declared with `exe @fn(args) = template "path.att"`. Inside the `.att` file, `@args` from the function signature are interpolated.

```
You are an agent. Review the following:

<context>
@context
</context>

Respond with JSON.
```

## Control Flow

```mlld
>> Pattern matching
var @result = when @status [
  "ready" => "proceed"
  "blocked" => "wait"
  * => "unknown"
]

>> Conditional blocks
if @condition [
  show `Condition met`
]

>> Guard
when @check == "no" => []
```

## Loops

```mlld
>> Infinite loop (for decision loops)
loop(endless) [
  >> ...
  if @done => done
  continue
]

>> For each
var @results = for @item in @items [
  => @process(@item)
]

>> Parallel for (N concurrent)
var @results = for parallel(20) @file in @files [
  >> Idempotency check
  let @fileCheck = @fileExists(@outPath)
  if @fileCheck == "yes" => "skipped"
  >> Do work...
  => @result
]
```

## Output & Logging

```mlld
show `Message: @variable`              >> Print to stdout
log `Debug: @variable`                 >> Print to stderr
output @data to "path/file.json"       >> Write to file (overwrite)
append @event to "path/events.jsonl"   >> Append to file
```

## Pipes

```mlld
@text | @json          >> Parse JSON
@text | @json.llm      >> LLM JSON extraction (handles markdown fences, etc.)
```

## String Templates

```mlld
var @msg = `Hello @name, count is @count`   >> Backtick interpolation
var @raw = 'no interpolation here'           >> Single quotes: literal
```

## Object/Array Access

```mlld
@obj.field            >> Field access
@obj.nested.field     >> Nested access
@arr[0]               >> Array index
@arr.length           >> Array length
@arr.join(", ")       >> Array join
@str.split("\n")      >> String split
@str.slice(0, 10)     >> String slice
@str.trim()           >> String trim
```

## Shell Execution

```mlld
>> cmd form: @params become @param in the command
exe @run(file) = cmd { mlld validate @file }

>> sh form: params become $param (shell variable style)
exe @exists(path) = sh { test -f "$path" && echo "yes" || echo "no" }

>> Inline run
run cmd { git status }

>> Allow non-zero exit
let @result = cmd { npm test } with { ok: true }
```

## Module Exports

```mlld
export { @fn1, @fn2, @variable }
```

## Common Orchestrator Patterns

### @claudePoll (LLM invocation with file polling)
```mlld
import { @claudePoll } from @mlld/claude-poll

let @result = @claudePoll(
  @prompt,           >> Prompt text
  "opus",            >> Model: haiku, sonnet, opus
  "@root",           >> Working directory
  "Read,Write,Glob", >> Tool permissions
  @outputPath        >> File the agent writes to
)
```

### State persistence
```mlld
>> Save state
output @state to "@runDir/run.json"

>> Load state with fallback
let @content = <@runDir/run.json>?
let @state = when !@content [
  true => { default: "values" }
  * => @content | @json
]

>> Append event
let @event = { ts: @now, event: "action", ...@data }
append @event to "@runDir/events.jsonl"
```

### File-based output protocol
```mlld
let @fullPrompt = `@prompt

IMPORTANT: Write your JSON response to @outputPath using the Write tool.`

let @_ = @claudePoll(@fullPrompt, "opus", "@root", @tools, @outputPath)
let @result = <@outputPath>?
```

### Idempotency
```mlld
let @fileCheck = @fileExists(@outPath)
if @fileCheck == "yes" [
  show `  Skipped: @outPath`
  => "skipped"
]
```
