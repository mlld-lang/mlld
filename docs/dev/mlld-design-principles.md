# mlld Design Principles: LLM-First Applications

How to build mlld applications that leverage LLM reasoning instead of fighting it.

## The Core Insight

Traditional programming encodes decisions in code: if-else branches, state machines, rule engines. This works when the decision space is small and well-defined.

LLM orchestration has a different character. The decision space is large, context-dependent, and full of edge cases. Every time you think you've handled all the cases, a new one appears.

**The breakthrough**: Stop encoding decisions in code. Let the LLM decide. Your orchestrator becomes a dumb executor that gathers context, asks "what should I do?", and does exactly that.

See also: `/llm-first` skill for quick reference.

## The Principles

### 1. Dumb Orchestrator, Smart Agents

Your mlld code should be boring. It should:
- Gather context
- Call an agent
- Execute the agent's instructions
- Verify results
- Log what happened
- Repeat

It should NOT:
- Decide what to work on next
- Determine if something is blocked
- Figure out priority ordering
- Parse state to infer what phase we're in
- Handle edge cases with conditionals

**Bad** (decision logic in code):
```mlld
if @ticket.status == "blocked" && @ticket.urgency == "high" [
  if @otherTickets.filter(t => t.status == "ready").length == 0 [
    >> Write questions file and exit
  ]
]
```

**Good** (agent decides):
```mlld
var @decision = @askDecisionAgent(@context)
when @decision.action [
  "blocked" => @writeQuestions(@decision.questions); done
  "work" => @spawnWorker(@decision.ticket)
  "complete" => @mergeAndExit()
]
```

### 2. Decision Calls (Not Persistent "Agents")

Instead of distributing decisions across your codebase, concentrate them in a single decision call that sees everything.

A "decision call" is: **prompt + tools + fresh context → structured action**

This is NOT:
- A persistent personality with memory
- A long-running chat session
- Something with identity or continuity between calls

Each iteration, you make a fresh call with full context. The LLM reads the context, applies the prompt's guidance, and returns one action. No chat history needed—the context IS the history.

**Why one decision point?**
- Consistency: Same logic applied everywhere
- Debuggability: One place to understand decisions
- Maintainability: Update one prompt, not scattered code
- Context: Sees the whole picture, not fragments

```mlld
>> Each iteration is a fresh call with fresh context
var @decision = run cmd {
  claude -m opus -p "@decisionPrompt" --input "@contextJson"
} | @parseJSON
```

### 3. Structured Actions, Not Free-Form Output

The decision agent returns structured JSON that the orchestrator can execute mechanically:

```json
{
  "reasoning": "Doc tickets complete, friction resolved, ready for impl",
  "action": "work",
  "ticket": "m-abc1",
  "task_type": "impl"
}
```

Define a schema for all possible actions. Validate against it. The orchestrator becomes a switch statement over action types.

This gives you:
- Type safety (schema validation)
- Predictable execution (finite action set)
- Clear contract between agent and orchestrator

### 4. Context Over State

Don't maintain complex state objects that can drift from reality. Instead, gather fresh context each iteration:

**Bad** (stateful):
```mlld
var @state = { phase: "docs", currentTicket: "m-abc1", blockedTickets: [...] }
>> Now you have to keep @state in sync with reality
```

**Good** (contextual):
```mlld
var @context = {
  tickets: run cmd { tk list --json },
  events: @loadRecentEvents(20),
  lastResult: @previousWorkerOutput
}
>> Model infers phase, blocking, etc. from context
```

The model reads the context and figures out where things stand. If you crash and resume, just gather context again—no state reconstruction needed.

### 5. Context Conventions

Consistent context structure makes prompts more durable and reusable.

**Standard context sections**:
```
<goal>
What we're trying to accomplish
</goal>

<state>
Current state: tickets, files, progress indicators
</state>

<history>
Recent events/actions (last N iterations)
</history>

<last_result>
Output from the previous action, including any errors
</last_result>

<constraints>
Hard limits, budgets, rules that must be enforced
</constraints>
```

**Why conventions matter**:
- Prompts can rely on consistent structure
- Easy to add new context without rewriting prompts
- Different pipelines can share prompt patterns
- Debugging is easier when context is predictable
- Models learn to navigate familiar structures

### 6. Prompts Over Predicates

Instead of encoding rules as conditionals, encode them as prompt guidance.

**Bad** (predicate in code):
```mlld
>> Check Chesterton's fence before creating ticket
if !@frictionPoint.chestertons_fence || @frictionPoint.chestertons_fence.possible_reason == "" [
  >> Reject or enhance...
]
```

**Good** (guidance in prompt):
```
## Guidance

### Chesterton's Fence
Before proposing changes to existing behavior, consider why it might be intentional.
Include this analysis when creating friction tickets. If you can't articulate why
the current behavior exists, flag for human review instead of assuming it's wrong.
```

The model applies this guidance contextually, handling variations you didn't anticipate.

### 7. Edge Cases in Prompts

When you discover an edge case, your instinct is to add code. Resist this.

**The old way**:
1. Discover edge case
2. Add conditional to handle it
3. Repeat until code is unmaintainable

**The LLM-first way**:
1. Discover edge case
2. Add guidance to decision agent prompt
3. Model handles it and similar cases

Example edge case: "If a ticket was started but has no progress events, it might be orphaned from a crash."

**Bad** (code):
```mlld
for @ticket in @tickets when @ticket.status == "started" [
  let @hasProgress = @events.some(e => e.ticket == @ticket.id && e.event == "progress")
  if !@hasProgress && @timeSince(@ticket.startedAt) > 30min [
    >> Reset ticket...
  ]
]
```

**Good** (prompt):
```
### Recognizing Orphaned Work
If you see a started ticket with no recent progress in the events log, it may have
been orphaned by a crash. Consider whether to continue from where it left off or
reset and retry.
```

### 8. Trust the Model

Models are good at:
- Reading context and inferring state
- Recognizing patterns ("this looks blocked")
- Applying judgment ("is this friction real or am I confused?")
- Explaining reasoning ("I'm choosing X because...")

Models are bad at:
- Executing shell commands
- Verifying test results
- Making commits
- Enforcing hard constraints (use schema validation)

**Design principle**: Let models do what they're good at. Use code for what code is good at.

Don't second-guess the model with validation code:
```mlld
>> Bad: re-checking the model's decision
if @decision.action == "complete" [
  >> But wait, let me verify it's really complete...
  if @tickets.some(t => t.status != "closed") [
    >> Override model's decision
  ]
]
```

If the model is making bad decisions, fix the prompt, not the orchestrator.

### 9. Verify, Don't Decide

The orchestrator SHOULD verify outcomes:
- Run tests and check exit codes
- Validate JSON against schemas
- Confirm files exist before committing

The orchestrator should NOT decide what to do about failures:
```mlld
>> Good: verify and feed back to agent
var @testResult = run cmd { npm test } with { ok: true }
var @context.lastTestResult = { passed: @testResult.exitCode == 0, output: @testResult.stderr }
>> Agent sees this next iteration and decides what to do

>> Bad: orchestrator decides how to handle failure
if @testResult.exitCode != 0 [
  >> Create friction ticket? Retry? Block?
  >> This is decision logic—let the model handle it
]
```

### 10. Check and Repair

Add resilience by having the model verify state and provide repair instructions when things go off track.

**The pattern**:
```mlld
>> After executing an action, check if we're on track
var @checkResult = run cmd {
  claude -m sonnet -p "@checkPrompt" --input "@postActionContext"
} | @parseJSON

if !@checkResult.on_track [
  >> Model provides repair instructions
  @executeAction(@checkResult.repair_action)
]
```

**Check prompt includes**:
- Expected state after the action
- Actual state observed
- Criteria for "on track"
- Guidance for common failure modes

**Benefits**:
- Self-healing without hardcoded repair logic
- Handles unexpected failures gracefully
- Repair logic evolves with the prompt, not code
- Can use a cheaper/faster model for routine checks

This is different from "verify, don't decide" in that check-and-repair is an optional resilience layer, while verification (running tests, checking exit codes) is mandatory infrastructure.

### 11. Logs Over State Machines

State machines are hard to debug because you can't see why you're in a state.

Event logs are easy to debug because you can see everything that happened.

```mlld
@logEvent("iteration", {
  decision: @decision.action,
  ticket: @decision.ticket,
  reasoning: @decision.reasoning
})
```

When something goes wrong, read the log. You'll see the agent's reasoning at each step. No need to reverse-engineer state transitions.

### 12. Human Handoff, Not Human Gating

When stuck, don't poll or block. Exit cleanly with clear questions for the human.

**Bad** (blocking):
```mlld
loop until @humanAnswered [
  >> Check if questions.md was edited...
  sleep 60
]
```

**Good** (handoff):
```mlld
if @decision.action == "blocked" [
  @writeQuestionsFile(@decision.questions)
  @logEvent("run_paused", { reason: "needs_human" })
  done "Human input needed - see questions.md"
]
>> Human runs resume command when ready
```

The run exits. Human answers at their leisure. Human resumes. Agent reads answers from context and continues.

## The Pattern

Every LLM-first mlld application follows this pattern:

```mlld
>> Initialize
var @config = <./config.mld>
var @run = @initRun(@config)

>> The loop
loop until @done [
  >> 1. Gather context (fresh each iteration, consistent structure)
  var @context = {
    goal: @config.goal,
    state: @gatherCurrentState(),
    history: @loadRecentEvents(20),
    last_result: @run.lastResult,
    constraints: @config.constraints
  }

  >> 2. Decision call
  var @decision = run cmd {
    claude -m opus -p "@decisionPrompt" --input "@context | @parse"
  } | @parseJSON | @validate(@actionSchema)

  >> 3. Execute action
  var @result = @executeAction(@decision)

  >> 4. Verify (if applicable)
  if @decision.action == "work" [
    var @verified = @runVerification(@config, @result)
    var @run.lastResult = { action: @decision, verified: @verified }
  ]

  >> 5. Optional: check and repair
  var @check = @checkOnTrack(@context, @result)
  if !@check.on_track [
    @executeAction(@check.repair_action)
  ]

  >> 6. Log
  @logEvent(@decision, @result)

  >> 7. Exit conditions
  when @decision.action [
    "blocked" => done "Needs human input"
    "complete" => done "Finished"
  ]
]
```

That's it. The complexity lives in:
1. The decision prompt (guidance for all decisions)
2. The worker prompts (guidance for execution)
3. The check prompt (guidance for detecting/repairing problems)
4. The schemas (contract between model and orchestrator)
5. The context conventions (predictable structure for all prompts)

The mlld code is just plumbing.

## Anti-Patterns

### The State Machine Trap
"I need to track which phase we're in..."

No. Give full context. The model will figure out the phase.

### The Validation Trap
"What if the model makes a wrong decision? I should add checks..."

Fix the prompt. If the model consistently misunderstands something, add clearer guidance. Or add check-and-repair as a resilience layer.

### The Special Case Trap
"But this one situation needs different handling..."

Add it to the prompt. The model will recognize similar situations.

### The Efficiency Trap
"Calling a model every iteration is expensive..."

It's cheaper than maintaining complex orchestration code. And better decisions mean fewer iterations overall.

### The Control Trap
"I don't trust the model to make this decision..."

Then you're building the wrong kind of application. The whole point is leveraging model reasoning. Use traditional code for things that shouldn't involve judgment.

## When This Doesn't Apply

This pattern works for orchestration—deciding what to do. It doesn't apply to:

- **Pure computation**: Math, parsing, deterministic transforms. Use code.
- **Hard constraints**: Security boundaries, resource limits. Enforce in code.
- **External integrations**: API calls, file I/O. Execute in code.
- **Verification**: Test running, schema validation. Do in code.

The model decides. The code executes and verifies.

## Summary

| Traditional | LLM-First |
|------------|-----------|
| Encode decisions in code | Encode decisions in prompts |
| Maintain state machines | Gather fresh context |
| Handle edge cases with conditionals | Handle edge cases with guidance |
| Distributed decision logic | Single decision call per iteration |
| Debug by tracing code paths | Debug by reading model reasoning |
| Complex orchestrator, simple prompts | Simple orchestrator, rich prompts |
| Hardcoded error recovery | Check-and-repair via model |
| Ad-hoc context structures | Consistent context conventions |

The result: Orchestration code that's 70% smaller, easier to maintain, and handles edge cases you never anticipated—because the model figures them out from context and guidance.
