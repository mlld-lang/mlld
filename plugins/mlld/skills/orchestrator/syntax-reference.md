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

## Pipeline retry with quality gate

Use `=> retry` in a pipeline stage to re-run from the source with feedback. Available context:
- `@mx.try` — attempt number (1-indexed)
- `@mx.hint` — value from the last `retry` (string or object)
- `@mx.input` — current stage's input (previous stage's output)

```mlld
>> Source re-runs on retry; @mx.hint carries gate feedback
exe @callAgent() = [
  let @feedback = @mx.hint ? `\n\nPrevious attempt rejected: @mx.hint` : ""
  let @fullPrompt = `@prompt@feedback

IMPORTANT: Write your JSON response to @outPath using the Write tool.`
  @claudePoll(@fullPrompt, "sonnet", "@root", @tools, @outPath)
  => <@outPath>?
]

>> Gate: accept, retry with feedback, or fall back
exe @qualityGate() = [
  if !@mx.input [ => { status: "failed" } ]
  let @gate = @checkOutput(@task, @mx.input)
  if @gate.pass [ => @mx.input ]
  if @mx.try < 3 [ => retry @gate.feedback ]
  => { status: "failed", reason: "gate_retry_failed" }
]

var @result = @callAgent() | @qualityGate
```

Retry with structured hint objects:

```mlld
>> Pass an object as the hint
=> retry { code: 429, reason: "rate limit" }

>> Read structured hint in the source
let @delay = @mx.hint.code == 429 ? "backoff" : "none"
```

Model escalation via `@mx.try`:

```mlld
exe @classify() = [
  let @model = @mx.try > 1 ? "sonnet" : "haiku"
  >> ...
]

exe @ensureConfidence() = when [
  @mx.input.confidence == "low" && @mx.try < 2 => retry
  * => @mx.input
]

var @routing = @classify() | @ensureConfidence
```
