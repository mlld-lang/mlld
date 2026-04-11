# Orchestrator Syntax Patterns

For general mlld syntax, run `mlld howto intro`. This covers orchestrator-specific patterns only.

## @claude (LLM invocation)

```mlld
import { @claude } from @mlld/claude

>> Returns the response directly
let @result = @claude(@prompt, { model: "sonnet", tools: ["Read", "Write", "Glob"] })
```

Config options for `@claude(prompt, config)`: model, dir, tools, stream, system, bare, sessionId, resume.

Convenience single-arg exes: `@haiku(@prompt)`, `@sonnet(@prompt)`, `@opus(@prompt)`.

## Checkpoint and Resume

```mlld
>> Label expensive calls — caching is automatic
exe llm @review(prompt) = @claude(@prompt, { model: "sonnet", tools: @tools })

>> Named checkpoints between phases
checkpoint "collection"
var @data = for parallel(20) @item in @items => @collect(@item)

checkpoint "analysis"
var @results = for parallel(20) @item in @items => @analyze(@item, @data)
```

```bash
>> CLI usage:
mlld run pipeline                      # auto-resumes via cache
mlld run pipeline --resume "analysis"  # skip to analysis phase
mlld run pipeline --resume @analyze    # re-run all @analyze calls
mlld run pipeline --resume @analyze("item-50")  # fuzzy: from item-50 onward
mlld run pipeline --new                # fresh run, clear cache
```

## Structured output

`@claude` returns the response directly — no file protocol needed.

```mlld
let @decision = @claude(@prompt, { model: "opus", tools: @tools })
```

To save prompts or responses for debugging:

```mlld
output @prompt to "@runDir/decision-@iteration.prompt.md"
```

## State persistence

For decision context only. The checkpoint system handles resumption automatically. Use event logs and run state when the decision agent needs to read history.

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

LLM cache handles idempotency for `llm`-labeled calls. No manual checks needed.

```mlld
>> Before (manual):
let @existing = <@outPath>?
if @existing [ => @existing | @parse ]

>> After (automatic — the llm label handles it):
exe llm @review(item) = @claude(@buildPrompt(@item), { model: "sonnet", tools: @tools })
var @result = @review(@item)  >> cache hit if already computed
```

Manual idempotency checks are only needed for non-LLM side effects.

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
var @decisionTools = ["Read", "Write", "Glob", "Grep"]
var @workerTools = ["Read", "Write", "Edit", "Glob", "Grep", "Bash(git:*)", "Bash(npm:*)"]
```

## Parallel fan-out

```mlld
exe llm @process(file) = @claude(@buildPrompt(@file), { model: "sonnet", tools: @tools })

>> Each call independently cached by argument hash — no manual idempotency needed
var @results = for parallel(20) @file in @files => @process(@file)
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
  let @fullPrompt = `@prompt@feedback`
  => @claude(@fullPrompt, { model: "sonnet", tools: @tools })
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
