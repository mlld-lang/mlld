# Orchestrator Syntax Patterns

For general mlld syntax, run `mlld howto intro`. This covers orchestrator-specific patterns only.

## @claudePoll (LLM invocation with file polling)

```mlld
import { @claudePoll } from @mlld/claude-poll

let @result = @claudePoll(
  @prompt,           >> Prompt text
  "opus",            >> Model: haiku, sonnet, opus
  "@root",           >> Working directory
  "Read,Write,Glob", >> Tool permissions
  @outputPath        >> Absolute path to file the agent writes
)
```

The prompt must instruct the agent to write to the output path. The function polls for that file, then returns its contents.

## File-based output protocol

```mlld
let @outputPath = `@runDir/decision-@iteration\.json`
let @fullPrompt = `@prompt

IMPORTANT: Write your JSON response to @outputPath using the Write tool.`

let @_ = @claudePoll(@fullPrompt, "opus", "@root", @tools, @outputPath)
let @decision = <@outputPath>?
```

## State persistence

```mlld
>> Save state
output @state to "@runDir/run.json"

>> Load state with fallback
let @content = <@runDir/run.json>?
let @state = when !@content [
  true => { default: "values" }
  * => @content | @parse
]

>> Append event
let @event = { ts: @now, event: "action", ...@data }
append @event to "@runDir/events.jsonl"
```

## Idempotency

Check if output exists before doing work. Makes reruns safe and enables resume.

```mlld
>> Option A: @exists() builtin
if @exists(@outPath) [
  show `  Skipped: @outPath`
  => "skipped"
]

>> Option B: optional file loading
let @existing = <@outPath>?
if @existing [
  show `  Skipped: @outPath`
  => @existing | @parse
]
```

## Template composition (.att files)

```mlld
exe @decisionPrompt(tickets, events, lastError) = template "./prompts/decision/core.att"
exe @workerPrompt(task, guidance, context) = template "./prompts/workers/implement.att"
```

Inside `.att` files, `@args` from the function signature are interpolated. Use XML-tagged sections:

```
<tickets>
@tickets
</tickets>

<recent_events>
@recentEvents
</recent_events>
```

## Tool permissions per role

```mlld
var @decisionTools = "Read,Write,Glob,Grep"
var @workerTools = "Read,Write,Edit,Glob,Grep,Bash(git:*),Bash(npm:*)"
```

## Parallel fan-out

```mlld
var @results = for parallel(20) @file in @files [
  let @outPath = `@runDir/results/@file.mx.filename\.json`

  >> Idempotency: skip if already done
  let @existing = <@outPath>?
  if @existing => @existing | @parse

  >> Do work...
  let @_ = @claudePoll(@prompt, "sonnet", "@root", @tools, @outPath)
  => <@outPath>? | @parse
]
```

## Decision loop

```mlld
loop(endless) [
  let @context = @buildContext(@runDir)
  let @decision = @callDecisionAgent(@context)
  when @decision.action [
    "work" => [...]
    "blocked" => [ @writeQuestions(...); done ]
    "complete" => done
  ]
]
```
