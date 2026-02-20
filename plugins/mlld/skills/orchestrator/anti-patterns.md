# Anti-Patterns in Orchestrator Design

## 1. The State Machine Trap

**Symptom**: Tracking phase with a variable and switching on it.

```mlld
>> BAD
var @phase = "discover"
loop(endless) [
  when @phase [
    "discover" => [
      >> ...
      let @phase = "assess"
    ]
    "assess" => [...]
  ]
]
```

**Fix**: Give the decision agent full context and let it infer the phase. Include phase guidance in the decision prompt. The orchestrator never knows what phase it's in.

```mlld
>> GOOD
loop(endless) [
  let @context = @buildContext(@runDir)  >> includes filesystem state
  let @decision = @callDecisionAgent(@context)
  when @decision.action [...]  >> pure switch, no phase tracking
]
```

## 2. The Validation Trap

**Symptom**: Adding predicate logic in the orchestrator to validate decisions before executing them.

```mlld
>> BAD
let @decision = @callDecisionAgent(@context)
if @decision.action == "complete" && @openTickets.length > 0 [
  >> Orchestrator overrides the decision
  show `Can't complete with open tickets`
  continue
]
```

**Fix**: Put the validation rules in the decision prompt. If the model keeps making bad decisions, fix the prompt — don't add compensating code.

The one exception: hard safety constraints (max iterations, budget limits) belong in code. Everything else belongs in prompts.

## 3. The Special Case Trap

**Symptom**: Adding if-else branches for specific situations.

```mlld
>> BAD
when @decision.action [
  "work" => [
    if @decision.task_type == "adversarial" && @lastResult.status == "failures_found" [
      >> Special handling for post-failure adversarial
    ]
  ]
]
```

**Fix**: Add guidance to the decision prompt or worker prompt instead. The model handles variations contextually, including cases you didn't anticipate.

```
### Post-Failure Re-verification
When dispatching adversarial verification after remediation,
include the previous failure details in guidance so the adversary
re-tests the specific claims that failed.
```

## 4. The Efficiency Trap

**Symptom**: Batching, caching, or short-circuiting to avoid LLM calls.

```mlld
>> BAD
>> "Let's batch all assessments before calling the decision agent"
>> "Let's cache the last decision and skip the call if context hasn't changed"
```

**Fix**: Better decisions = fewer iterations = lower total cost. A cheap call that makes a poor decision costs more in wasted work than an expensive call that gets it right.

The exception: parallel fan-out operations (assessment, invalidation) should absolutely be batched with `for parallel(N)`. But the decision about *what* to batch comes from the decision agent.

## 5. The Control Trap

**Symptom**: Not trusting the model to make decisions, so adding human-in-the-loop for routine choices.

```mlld
>> BAD
let @decision = @callDecisionAgent(@context)
show `Decision agent wants to: @decision.action. Approve? (y/n)`
>> ... wait for human approval each iteration
```

**Fix**: If you don't trust the model to make a category of decisions, either improve the prompt or use traditional code for that category. The whole point of LLM-first design is letting models decide. Trust the model for routine decisions; use human handoff for genuinely blocked situations.

## 6. The Context Flooding Trap

**Symptom**: Dumping entire specs, codebases, or histories into context.

```mlld
>> BAD
var @entireSpec = <spec.md>
var @entireCodebase = <src/**/*.ts>
var @allEvents = @loadRecentEvents(@runDir, 10000)
let @prompt = @decisionPrompt(@entireSpec, @entireCodebase, @allEvents)
```

**Fix**: Selective context loading. The job declares what it needs; the context builder loads only that. Recent events (last 20-30), relevant code sections, and focused state summaries.

```mlld
>> GOOD
let @events = @loadRecentEvents(@runDir, 20)
let @ref = @buildReferenceMaterial(@config, @job)  >> loads only needed sections
```

## 7. The Escalation Ladder Trap

**Symptom**: Coding escalation logic with increasing levels of intervention.

```mlld
>> BAD
if @failureCount == 1 => "retry"
if @failureCount == 2 => "retry with more context"
if @failureCount == 3 => "escalate to human"
```

**Fix**: Put escalation rules in the prompt. The decision agent reads the event history and decides escalation contextually.

```
### Escalation
If a worker fails the same task twice with similar errors,
investigate the root cause before retrying. If investigation
reveals the task requires information you don't have, escalate
to the human with your analysis.
```

The model handles escalation better than code because it reads the *reason* for failure, not just the count.

## 8. The Manual Retry Trap

**Symptom**: Manually checking LLM output, rebuilding the prompt with feedback, and calling the LLM again in code.

```mlld
>> BAD
@claudePoll(@prompt, "sonnet", "@root", @tools, @outPath)
let @result = <@outPath>?
let @gate = @checkOutput(@task, @result)
if !@gate.pass [
  let @retryPrompt = `@prompt

Previous attempt was rejected: @gate.feedback

Address the feedback and try again.`
  @claudePoll(@retryPrompt, "sonnet", "@root", @tools, @outPath)
  let @retryResult = <@outPath>?
  >> ... more manual checking ...
]
```

**Fix**: Use pipeline `=> retry` with `@mx.hint`. The source stage reads `@mx.hint` for feedback; the gate stage validates and retries declaratively.

```mlld
>> GOOD
exe @callAgent() = [
  let @feedback = @mx.hint ? `\n\nPrevious attempt rejected: @mx.hint` : ""
  let @fullPrompt = `@prompt@feedback
  ...`
  @claudePoll(@fullPrompt, "sonnet", "@root", @tools, @outPath)
  => <@outPath>?
]

exe @qualityGate() = [
  let @gate = @checkOutput(@task, @mx.input)
  if @gate.pass [ => @mx.input ]
  if @mx.try < 3 [ => retry @gate.feedback ]
  => { status: "failed" }
]

var @result = @callAgent() | @qualityGate
```

The pipeline handles retry count, feedback passing, and fallback. The orchestrator code stays declarative.

## 9. The Resumption Infrastructure Trap

**Symptom**: Building run directory resolution, dated run IDs, event logging, file-existence checks, and retry-loops-around-parallel-for to handle crashes and enable resume.

```mlld
>> BAD
exe @mkdirp(dir) = sh { mkdir -p "$dir" }
var @today = @now.slice(0, 10)
var @runDir = `@root/runs/@today`
run @mkdirp(@runDir)
run @mkdirp(`@runDir/reviews`)

loop(@maxAttempts) [
  for parallel(@parallelism) @item in @items [
    let @outPath = `@runDir/reviews/@item.id\.json`
    if @fileExists(@outPath) [
      show `  @item.name: skipped`
      => null
    ]
    @claudePoll(@prompt, "opus", "@root", @tools, @outPath)
    let @result = <@outPath>?
    if !@result [
      @logEvent(@runDir, "failed", { id: @item.id })
      => null
    ]
    @logEvent(@runDir, "complete", { id: @item.id })
    => null
  ]
  let @checks = for @c in @items [
    let @exists = @fileExists(`@runDir/reviews/@c.id\.json`)
    if @exists != "yes" [ => 1 ]
    => null
  ]
  let @missing = for @x in @checks when @x => @x
  if @missing.length == 0 [ done ]
  show `  Retrying @missing.length failed items...`
  continue
]
```

**Fix**: The `llm` label makes each call individually cacheable. Crash at item 47 out of 100? Re-run. Items 1-46 are instant cache hits. No run directories, no event logs, no retry loops, no idempotency checks.

```mlld
>> GOOD
exe llm @review(item) = @claudePoll(@buildPrompt(@item), "opus", "@root", @tools)

checkpoint "review"
var @results = for parallel(20) @item in @items => @review(@item)
```

Event logs are still valid when the decision agent reads them as context (the development archetype). But for linear pipelines where events were only for resumption, the checkpoint cache replaces all of it.