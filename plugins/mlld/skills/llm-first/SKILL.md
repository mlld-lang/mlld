---
name: mlld:llm-first
description: LLM-first design principles for mlld applications. Use when designing pipelines, refactoring complex orchestration, or hitting edge cases that keep requiring more conditionals.
---

## When to Use

- Designing a new mlld pipeline or workflow
- Refactoring complex orchestration code
- Hitting edge cases that keep requiring more conditionals
- Building anything with loops, state, and LLM calls

## Core Concept

**Traditional approach**: Encode decisions in code (if-else, state machines, rules). The code decides; the LLM executes.

**LLM-first approach**: Encode decisions in prompts. The LLM decides; the code executes. Your orchestrator becomes a dumb executor that gathers context, asks "what should I do?", does exactly that, verifies results, and repeats.

---

## Key Principles

### 1. Dumb Orchestrator, Smart Decisions

Your mlld code should be boring:
- Gather context
- Call a decision-making LLM
- Execute the returned action
- Verify results
- Log what happened
- Repeat

Your mlld code should NOT:
- Decide what to work on next
- Determine if something is blocked
- Handle edge cases with conditionals
- Maintain complex state machines

When you need new behavior, add guidance to the decision prompt. Don't add if-else to the orchestrator.

> **Example**: [`examples/development/index.mld:70-230`](../../examples/development/index.mld) — The main loop is mechanical. The `when @decision.action` block is a pure switch with no decision logic.

### 2. Decision Calls (Not "Agents")

A "decision call" is: **prompt + tools + fresh context → structured action**

This is NOT:
- A persistent personality with memory
- A long-running chat session
- Something with identity or continuity

Each iteration, you make a fresh call with full context. The LLM reads the context, applies the prompt's guidance, and returns one action. No chat history needed — the context IS the history.

```mlld
>> Each iteration is a fresh call with fresh context
let @context = @buildContext(@runDir)
let @decision = @claudePoll(@fullPrompt, "opus", "@root", @tools, @outputPath)
```

> **Example**: [`examples/development/index.mld:81-109`](../../examples/development/index.mld) — Fresh `@buildContext` + `@claudePoll` each iteration. No conversation history carried forward.

### 3. Check and Repair

The decision loop inherently handles repair. Each iteration the decision agent sees full current state — including failures, corrupt data, and partial results from the last action. If the last worker produced garbage, the decision agent sees it in context and corrects course: redo the work, take a different approach, or create a new issue to address it.

This happens naturally because:
- Context is rebuilt fresh each iteration (principle 2)
- `lastWorkerResult` and `lastError` are always in context
- The decision agent applies judgment about what to do next

You don't need a separate "check" step. The decision loop IS the check.

> **Example**: [`examples/development/lib/context.mld:44-51`](../../examples/development/lib/context.mld) — `@buildContext` loads `lastWorkerResult` and `lastError` into context. [`examples/development/index.mld:164-171`](../../examples/development/index.mld) — Worker failure is recorded in state and the loop continues, letting the decision agent see the failure next iteration.

### 4. Structured Actions

The decision call returns structured JSON that the orchestrator executes mechanically:

```json
{
  "reasoning": "Brief explanation",
  "action": "work|create_issue|close_issue|blocked|complete",
  ...action-specific fields...
}
```

Define a schema. Validate against it. The orchestrator becomes a simple switch over action types. No interpretation needed.

> **Example**: [`examples/development/schemas/decision.json`](../../examples/development/schemas/decision.json) — Conditional JSON Schema with five action types and action-specific required fields. [`examples/development/index.mld:121-227`](../../examples/development/index.mld) — Pure `when @decision.action` switch.

### 5. Context Conventions

Consistent context structure makes prompts more durable and reusable.

**Standard context sections**:
```
<goal>
What we're trying to accomplish
</goal>

<state>
Current state: tickets, files, progress
</state>

<recent_events>
Recent actions from events.jsonl
</recent_events>

<last_result>
Output from the previous action
</last_result>

<last_error>
Error from last iteration (if any)
</last_error>
```

**Why conventions matter**:
- Prompts can rely on consistent structure
- Easy to add new context without changing prompts
- Different pipelines can share prompt patterns
- Debugging is easier when context is predictable

> **Example**: [`examples/development/prompts/decision/core.att:107-129`](../../examples/development/prompts/decision/core.att) — Uses `<issues>`, `<recent_events>`, `<last_worker_result>`, `<last_error>`, `<human_answers>` sections.

### 6. Prompts Over Predicates

Instead of conditionals in code, encode rules as prompt guidance:

**Bad** (code predicate):
```mlld
if @ticket.status == "blocked" && @urgency == "high" [
  if @otherTickets.filter(t => t.ready).length == 0 [
    >> exit logic
  ]
]
```

**Good** (prompt guidance):
```
### Blocking Detection
If all remaining tickets require human input and no other work is available,
return a "blocked" action with clear questions for the human.
```

The model applies guidance contextually, handling variations you didn't anticipate.

> **Example**: [`examples/development/prompts/decision/core.att:86-105`](../../examples/development/prompts/decision/core.att) — Workflow guidance encodes dependency analysis, information gain, adversarial gates, and issue lifecycle rules as prose, not conditionals.

### 7. Multi-Phase Jobs via Prompt

Complex jobs have phases (e.g., Discover → Assess → Synthesize → Invalidate). Let the decision agent track phases and progress via guidance in prompts and its access to history logs, rather than creating a programmatic state machine.

**The pattern**:
- Decision prompt describes phases and transition rules as prose guidance
- Decision agent reads the event log and filesystem state to infer what phase the project is in
- Decision agent decides when to advance, revisit, or skip phases based on what it observes
- Orchestrator has zero awareness of phases — no phase variable, no phase transitions in code

> **Example**: [`examples/research/prompts/decision/core.att:68-77`](../../examples/research/prompts/decision/core.att) — Phase inference from filesystem state: no inventory → discover, assessments incomplete → assess, etc. [`examples/research/index.mld`](../../examples/research/index.mld) — The orchestrator never checks what phase it's in.

### 8. Edge Cases in Prompts

When you discover an edge case:

**Old way**: Add conditional → code grows → becomes unmaintainable

**LLM-first way**: Add guidance to prompt → model handles it and similar cases

```
### Orphaned Work
If you see a started ticket with no recent progress in the history,
it may have been orphaned by a crash. Decide whether to continue
from where it left off or reset and retry.
```

This extends to understanding existing behavior. Before changing something, consider why current behavior might be intentional — encode that instinct in the prompt rather than building checks into code.

> **Example**: [`examples/development/prompts/decision/core.att:97-105`](../../examples/development/prompts/decision/core.att) — Issue lifecycle guidance handles edge cases like premature closure and verification requirements as prose rules.

### 9. Worker Guidance

Decision agent can inject per-action context into worker calls.

```json
{
  "action": "work",
  "issue": 42,
  "task_type": "implement",
  "guidance": "Focus on error handling. The happy path already works."
}
```

Workers get targeted instructions. The decision agent's reasoning flows to execution. More effective than generic worker prompts.

> **Example**: [`examples/development/schemas/decision.json:21`](../../examples/development/schemas/decision.json) — `guidance` field on work action. [`examples/development/index.mld:131-136`](../../examples/development/index.mld) — Worker prompt built with `@decision.guidance`.

### 10. Selective Context Loading

Don't flood context with everything. Load only what's relevant to the current decision.

**The pattern**:
1. Bound the number of recent events (e.g., last 30)
2. Load state summaries, not raw data
3. Let the decision agent use tools to dig deeper if needed

**Benefits**:
- Stays within token limits
- Focused context = better decisions
- Scales to large codebases

> **Example**: [`examples/development/lib/context.mld:44-51`](../../examples/development/lib/context.mld) — `@buildContext` loads last 30 events (not all), plus summary state. The decision agent has Read/Glob/Grep tools to investigate further when needed.

### 11. Verify, Don't Decide

The orchestrator SHOULD verify outcomes:
- Run tests, check exit codes
- Validate JSON against schemas
- Confirm files exist

The orchestrator should NOT decide what to do about failures:
```mlld
>> Good: record result and let decision agent handle it
let @result = <@workerOutputPath>?
if !@result [
  @logEvent(@runDir, "error", { type: "worker", error: "no output" })
  let @errState = { ...@runState, lastError: "Worker failed", lastWorkerResult: null }
  @saveRunState(@runDir, @errState)
  continue
]
>> Decision agent sees the error next iteration and decides what to do
```

> **Example**: [`examples/development/index.mld:164-171`](../../examples/development/index.mld) — Worker failure is recorded in state. No retry logic, no error handling conditionals. The decision agent sees the failure next iteration.

### 12. Human Handoff, Not Gating

When stuck, exit cleanly with questions. Don't poll or block.

```mlld
"blocked" => [
  @writeQuestionsFile(@runDir, @decision.questions, @resolvedRunId)
  @logEvent(@runDir, "run_paused", { reason: "needs_human" })
  show `Resume with: mlld <this-script> --run @resolvedRunId`
  done
]
```

Human answers at their leisure. Human resumes. Decision call reads answers from context and continues.

> **Example**: [`examples/development/index.mld:207-213`](../../examples/development/index.mld) — Blocked handler writes questions file and exits. [`examples/development/lib/questions.mld`](../../examples/development/lib/questions.mld) — Structured questions with context and resume instructions.

### 13. Logs Over State Machines

State machines hide why you're in a state. Event logs show everything.

```mlld
@logEvent(@runDir, "iteration", {
  decision: @decision.action,
  reasoning: @decision.reasoning
})
```

Debug by reading the log. See the model's reasoning at each step.

> **Example**: [`examples/development/lib/context.mld:7-12`](../../examples/development/lib/context.mld) — `@logEvent` appends structured events to JSONL. [`examples/development/index.mld:118`](../../examples/development/index.mld) — Every iteration logs the decision and reasoning.

### 14. Resumable Run State

Enable clean resume after interruption or human handoff.

**The pattern**:
- Explicit run IDs: `2026-01-31` (date-based default)
- Minimal state file: `run.json` with `lastWorkerResult`, `lastError`
- Full event log: `events.jsonl` for history
- Resume flag: `--run <id>`

> **Example**: [`examples/development/lib/context.mld:31-41`](../../examples/development/lib/context.mld) — `@loadRunState`/`@saveRunState` manage `run.json`. [`examples/development/index.mld:42-60`](../../examples/development/index.mld) — Run ID resolution and state initialization.

### 15. File-Based Output Protocol

Instead of parsing LLM streaming output, tell the agent to write JSON to a specific path.

```mlld
let @outputPath = `@runDir/decision-@iteration.json`
let @fullPrompt = `@prompt

IMPORTANT: Write your JSON response to @outputPath using the Write tool.`

@claudePoll(@fullPrompt, "opus", "@root", @tools, @outputPath)
let @decision = <@outputPath>?
```

The orchestrator reads the file after the agent finishes. The file doubles as a debugging artifact.

> **Example**: [`examples/development/index.mld:94-109`](../../examples/development/index.mld) — Decision agent writes to specific path; orchestrator reads file. [`examples/research/index.mld:78-86`](../../examples/research/index.mld) — Same pattern for research decisions.

### 16. Prompt Archival

Save prompts to files for debugging failed runs.

```mlld
>> Save prompt for debugging
output @workerFullPrompt to "@runDir/worker-@issueNum-@iterationCount\.prompt.md"
```

Can replay failed prompts manually. Inspect exactly what the model saw. Essential for debugging complex pipelines.

> **Example**: [`examples/development/index.mld:146-153`](../../examples/development/index.mld) — Worker prompts saved to `@workerPromptPath` before execution. Prompt path also logged in the event.

### 17. External State Systems

Separate state management from orchestration. Use external systems for issues, tickets, etc.

**The pattern**:
- External system manages state (e.g., GitHub Issues)
- Orchestrator reads state: `gh issue list --json ...`
- Decision agent decides mutations
- Orchestrator executes mutations: `gh issue create`, `gh issue close`

State survives orchestrator crashes. Multiple orchestrators can coordinate. State is inspectable outside the pipeline.

> **Example**: [`examples/development/index.mld:83-88`](../../examples/development/index.mld) — Loads issues via `gh issue list`. [`examples/development/index.mld:188-205`](../../examples/development/index.mld) — Creates and closes issues via `gh` CLI.

---

## The Universal Pattern

```mlld
>> Initialize
var @run = @initRun(@config)

>> The loop
loop(endless) [
  >> 1. Gather context (fresh each iteration)
  let @context = @buildContext(@runDir)

  >> 2. Decision call
  let @decision = @claudePoll(@fullPrompt, "opus", "@root", @tools, @outputPath)

  >> 3. Execute action (mechanical switch)
  when @decision.action [
    "work" => [...]
    "blocked" => [ @writeQuestions(...); done ]
    "complete" => done
  ]

  >> 4. Log
  @logEvent(@runDir, @decision.action, { reasoning: @decision.reasoning })
]
```

---

## Anti-Patterns to Avoid

**State Machine Trap**: "I need to track which phase we're in..."
→ Give full context. The model infers the phase.

**Validation Trap**: "What if the model makes a wrong decision? I should add checks..."
→ Fix the prompt. The decision loop self-corrects on the next iteration.

**Special Case Trap**: "But this situation needs different handling..."
→ Add guidance to the prompt.

**Efficiency Trap**: "Calling a model every iteration is expensive..."
→ Better decisions = fewer iterations. Cheaper than maintaining complex code.

**Control Trap**: "I don't trust the model to decide this..."
→ Then you're building the wrong kind of application. Use traditional code.

**Context Flooding Trap**: "I'll just include the whole spec..."
→ Selective loading. Bound events, summarize state, give tools for deeper digs.

**Escalation Ladder Trap**: "I need if-else for different escalation levels..."
→ Put escalation rules in the prompt. Let the model apply judgment.

---

## When NOT to Use This Pattern

Use traditional code for:
- **Pure computation**: Math, parsing, deterministic transforms
- **Hard constraints**: Security boundaries, resource limits
- **External integrations**: API calls, file I/O execution
- **Verification**: Running tests, checking exit codes

The model decides. The code executes and verifies.

---

## Result

Orchestration code that's 70% smaller, handles edge cases gracefully, and is maintainable — because the logic lives in prompts you can read and update, not scattered conditionals.
