---
name: mlld:orchestrator
description: Designing and building mlld orchestrators for LLM workflows. Use when creating pipelines that coordinate LLM calls, processing data at scale, or building decision-driven automation.
---

## Prerequisites

**IMMEDIATELY AFTER READING THIS SKILL, YOU MUST RUN `mlld howto intro` before writing any mlld code.** The intro covers syntax, gotchas, built-in methods, file loading, and common traps. Skipping it leads to inventing non-existent features and writing code that validates but fails at runtime.

```bash
mlld howto intro              # Language fundamentals — read this first
mlld init                     # Initialize project (enables mlld run)
mlld install @mlld/claude-poll  # Install the Claude polling module
```

It is *strongly* encouraged to view at least one of the examples in `plugins/mlld/examples/` before writing an orchestrator — `audit/`, `research/`, and `development/` each demonstrate a complete archetype.

## Core Pattern

Every mlld orchestrator follows one flow:

```
gather context → execute (LLM call) → invalidate → remediate → re-invalidate
```

Work is broken until the adversary can't break it. This is the default stance.

## Best Practices

Every orchestrator should be:

1. **Resilient** — Label expensive calls with `exe llm`. Crash recovery is automatic via the LLM cache. Use `checkpoint` directives between phases for `--resume` targeting. Use `--new` to start a fresh run.
2. **Parallel** — Use `for parallel(N)` wherever items are independent. Accept `--parallel n` to let the caller cap concurrency (default: 20).
3. **Observable** — Use hooks for instrumentation. Save prompts to debug files (`output @prompt to "@runDir/worker-*.prompt.md"`).
4. **Dumb** — Code gathers context and executes actions. The LLM decides everything. No if-else for business logic. See `/mlld:llm-first` for the full design philosophy.
5. **Organized** — Write logs and artifacts to `llm/output/{script-name}/YYYY-MM-DD-n` by default unless the caller specifies otherwise.

## Resilience Model

One cache, three invalidation strategies:

| Strategy | Scope | Use case | How it works |
|----------|-------|----------|-------------|
| Automatic (LLM cache) | Per-call | Crash recovery | Re-run script, `llm`-labeled calls with same args hit cache |
| `--resume @fn` | Per-function | Prompt iteration | Invalidate all cached results for a function, re-execute |
| `--resume "name"` | Per-phase | Workflow navigation | Named `checkpoint` directive marks a position; invalidate all LLM calls after it |

### Labeling LLM calls

The `llm` label on `exe` marks calls for caching. Checkpointing auto-enables when `llm`-labeled calls exist — no flag needed.

```mlld
>> Define once — every invocation is independently cached by argument hash
exe llm @review(prompt) = @claudePoll(@prompt, "sonnet", "@root", @tools)

>> For one-off calls
var llm @summary = @claudePoll(@prompt, "sonnet")
```

### Crash recovery

Just re-run. Completed `llm`-labeled calls hit cache automatically. No run directories, no event logs, no idempotency checks.

```bash
mlld run pipeline              # crashes at item 47 of 100
mlld run pipeline              # items 1-46 are instant cache hits, continues from 47
```

### Named checkpoints

`checkpoint` directives mark phase boundaries. On `--resume "name"`, everything before the checkpoint hits cache; everything after re-executes.

```mlld
exe llm @collect(item) = @claudePoll(@collectPrompt(@item), "sonnet", "@root", @tools)
exe llm @analyze(item, data) = @claudePoll(@analyzePrompt(@item, @data), "opus", "@root", @tools)

checkpoint "collection"
var @data = for parallel(20) @item in @items => @collect(@item)

checkpoint "analysis"
var @results = for parallel(20) @item in @items => @analyze(@item, @data)
```

```bash
mlld run pipeline                      # auto-resumes via cache
mlld run pipeline --resume "analysis"  # skip to analysis phase
mlld run pipeline --resume @analyze    # re-run all @analyze calls
mlld run pipeline --new                # fresh run, clear cache
```

### Why loops don't need checkpoints

Checkpoints are top-level only. Loops are covered by the other two strategies:

- **`for parallel` over a collection**: Each `llm`-labeled call gets a unique cache key (different args per item). Crash at item 547? Re-run, items 1-546 hit cache automatically.
- **`loop()` convergence loops**: Each iteration calls functions with evolving arguments, so they get different cache keys. Cache handles crash recovery call-by-call.
- **Prompt iteration inside loops**: Use `--resume @fn` to invalidate a specific function across all iterations.

### Before and after

BEFORE (manual resumption, ~40 lines per phase):
```mlld
loop(@maxAttempts) [
  for parallel(@parallelism) @item in @items [
    let @outPath = `@runDir/phase1/@item.id\.json`
    let @alreadyDone = @fileExists(@outPath)
    if @alreadyDone == "yes" [
      show `  @item.name: skipped`
      => null
    ]
    show `  @item.name: processing...`
    @claudePoll(@prompt, "opus", "@root", @tools, @outPath)
    let @result = <@outPath>?
    if !@result [
      show `  @item.name: FAILED`
      @logEvent(@runDir, "failed", { id: @item.id })
      => null
    ]
    @logEvent(@runDir, "complete", { id: @item.id })
    => null
  ]
  let @checks = for @c in @items [
    let @exists = @fileExists(`@runDir/phase1/@c.id\.json`)
    if @exists != "yes" [ => 1 ]
    => null
  ]
  let @missing = for @x in @checks when @x => @x
  if @missing.length == 0 [ done ]
  show `  Retrying @missing.length failed items...`
  continue
]
```

AFTER (checkpoint, ~3 lines):
```mlld
exe llm @review(item) = @claudePoll(@buildPrompt(@item), "opus", "@root", @tools)

checkpoint "phase-1"
var @results = for parallel(20) @item in @items => @review(@item)
```

**LLM-first cheat sheet** (see `/mlld:llm-first` for details):
- Dumb orchestrator, smart decision calls — code gathers, model decides
- Fresh context each iteration — no chat history, the context IS the history
- Structured JSON actions — orchestrator switches mechanically, no interpretation
- Prompts over predicates — rules in prompts, not if-else in code
- Hooks over manual logging — observe operations at evaluation boundaries, not with inline code

## The Dumb Orchestrator

Your mlld code should be boring. It gathers context, asks an LLM "what should I do?", executes the answer mechanically, and repeats. All intelligence lives in prompts. The orchestrator is a switch statement.

**Code does**:
- Gather context (load files, query state, read events)
- Call decision agent with full context
- Switch on the returned action type
- Execute the action mechanically
- Log what happened
- Repeat

**Code does NOT**:
- Decide what to work on next
- Determine if something is blocked
- Handle edge cases with conditionals
- Maintain state machines

When you need new behavior, add guidance to the decision prompt. Don't add if-else to the orchestrator.

## Adversarial Invalidation

The throughline of every orchestrator. Default is failure. Work is broken until proven otherwise.

**Evidence-based**: Every claim requires command + output + interpretation. "Probably works" is invalid.

**No substitution**: Test the actual mechanism described. If the spec says "env block restricts tools," test an env block — don't test a different mechanism and call it equivalent.

**Remediation requires re-invalidation**: Fixing a finding doesn't close it. The adversary must re-test after the fix.

All three example archetypes include invalidation workers. See:
- `examples/audit/` — verified invalidation with tool escalation
- `examples/research/` — invalidation of synthesis claims
- `examples/development/` — adversarial verification of implementation

### Blind Invalidation vs Verified Invalidation

The naive pattern — give the adversary the same context as the worker and ask "is this right?" — produces false positives. The adversary has no more information than the original worker, so it either rubber-stamps or invents objections from thin air.

**The fix: give the adversary more tools than the worker had.** This is the verified invalidation pattern:

1. **Phase 1 (constrained)**: Worker operates with limited context. Produces candidate findings.
2. **Phase 2 (expanded)**: Verifier gets the same findings PLUS broader tool access to check them empirically.

The verifier must answer: "Can I prove this finding is real?" — not "Does this look right?"

```
Phase 1 worker:    Read-only, scoped context → candidate findings
Phase 2 verifier:  Read + search + execute → verified findings with evidence
```

**Concrete tool escalation**:
- Phase 1 gets `Read,Write,Glob,Grep` (enough to compare inputs)
- Phase 2 gets `Read,Write,Glob,Grep,Bash(mlld:*),Bash(ls:*)` (can search the codebase, run validation commands, check test cases)

**Verification requirements** (enforce in the prompt):
- "WRONG" claims → run the actual command or validator on both versions
- "FABRICATED" claims → search the full codebase before declaring something doesn't exist
- "MISSING" claims → confirm the content is genuinely absent, not just in a different location
- Every kept finding must cite a specific file path + line as evidence
- Apply **Chesterton's Fence**: before confirming a finding, state why the current content might be intentional

**Classification taxonomy** (give the verifier these options):
- `confirmed`: Evidence supports the finding — cite specific files
- `false-positive`: The feature/content exists, worker just didn't see it
- `insufficient-context`: Worker's context was too narrow — note where the answer lives
- `needs-human`: Ambiguous, might be intentional design

This pattern comes from the QA workflow (`llm/run/qa/`), where Phase 1 (black-box testing with limited docs) produces candidate issues, and Phase 2 (self-review with test cases + source access) verifies them empirically. The self-review consistently reclassifies 30-50% of Phase 1 findings as false positives.

**Anti-pattern**: Giving the adversary the exact same tools and context as the original worker. If the worker couldn't tell, neither can the adversary. Escalate access or the invalidation step is theater.

## Quality Gates and Retry

Use pipeline `=> retry` with `@mx.hint` for step-level quality checks on LLM output. The gate validates the output and either accepts it, retries with feedback, or falls back after max attempts.

```mlld
>> Source: calls the LLM (re-runs on retry with gate feedback via @mx.hint)
exe @callAgent() = [
  let @feedback = @mx.hint ? `\n\nPrevious attempt was rejected: @mx.hint\n\nAddress the feedback and try again.` : ""
  let @fullPrompt = `@prompt@feedback

IMPORTANT: Write your JSON response to @outPath using the Write tool.`
  @claudePoll(@fullPrompt, "sonnet", "@root", @tools, @outPath)
  => <@outPath>?
]

>> Gate: validates output, retries with feedback, falls back after 3 attempts
exe @qualityGate() = [
  if !@mx.input [ => { status: "failed" } ]
  let @gate = @checkOutput(@task, @mx.input)
  if @gate.pass [ => @mx.input ]
  if @mx.try < 3 [ => retry @gate.feedback ]
  => { status: "failed", reason: "gate_retry_failed" }
]

var @result = @callAgent() | @qualityGate
```

On retry, `@callAgent()` re-executes with `@mx.try` incremented and `@mx.hint` set to the gate's feedback. The LLM sees the rejection reason and can correct its output.

**Model escalation** follows the same pattern — use `@mx.try` to pick the model:

```mlld
exe @classify() = [
  let @model = @mx.try > 1 ? "sonnet" : "haiku"
  >> ... call @claudePoll with @model ...
  => @result
]

exe @ensureConfidence() = when [
  @mx.input.confidence == "low" && @mx.try < 2 => retry
  * => @mx.input
]

var @routing = @classify() | @ensureConfidence
```

**When to use pipeline retry vs. decision-loop repair**:
- **Pipeline retry**: Within-step validation of a single LLM call — "did this output meet the bar?" Bounded, deterministic, fast.
- **Decision loop**: Cross-step correction — the decision agent sees failures in context and adjusts strategy. Open-ended, judgment-driven.

Both can coexist. A worker might use pipeline retry for output quality, while the outer decision loop handles strategic failures.

## Three Archetypes

### 1. Audit (parallel fan-out + verified invalidation)

Glob files → parallel LLM review (limited tools) → collect findings → parallel verification (expanded tools) → output classified results.

No decision agent. Linear pipeline. Fastest to build. Demonstrates tool escalation between phases.

**Use when**: Processing a batch of similar items independently (file review, data extraction, classification).

**See**: [../../examples/audit/](../../examples/audit/)

```mlld
>> Phase 1: reviewer sees only the file
var @reviewTools = "Read,Write"
>> Phase 2: verifier can explore the codebase
var @verifyTools = "Read,Write,Glob,Grep"

exe llm @review(file) = @claudePoll(@reviewPrompt(@file), "sonnet", "@root", @reviewTools)
exe llm @verify(finding, source) = @claudePoll(@verifyPrompt(@finding, @source), "sonnet", "@root", @verifyTools)

var @files = <src/**/*.ts>

checkpoint "review"
var @results = for parallel(20) @file in @files => @review(@file)

checkpoint "verify"
var @verified = for parallel(20) @finding in @results => @verify(@finding, @finding.file)
```

### 2. Research (multi-phase pipeline + invalidation)

Decision agent infers phase from filesystem state. Parallel fan-out for batch operations. Builds toward a synthesis that gets invalidated.

**Use when**: Multi-step analysis where phases depend on prior results (document analysis, research synthesis, data pipeline).

**See**: [../../examples/research/](../../examples/research/)

```mlld
exe llm @assess(source) = @claudePoll(@assessPrompt(@source), "sonnet", "@root", @workerTools)
exe llm @synthesize(data) = @claudePoll(@synthesizePrompt(@data), "opus", "@root", @workerTools)

loop(endless) [
  let @context = @buildContext(@runDir)
  let @decision = @callDecisionAgent(@context)
  when @decision.action [
    "discover" => [...]
    "assess" => [...]   >> for parallel(20)
    "synthesize" => [...]
    "invalidate" => [...] >> for parallel(20)
    "complete" => done
  ]
]
```

### 3. Development (decision loop + full invalidation)

Continuous decision loop with external state (GitHub Issues). Creates issues, dispatches workers, runs adversarial verification. Quality gate before completion.

**Use when**: Open-ended tasks requiring iteration, external coordination, and quality assurance (feature development, project automation).

**See**: [../../examples/development/](../../examples/development/)

```mlld
exe llm @callWorker(prompt, model) = @claudePoll(@prompt, @model, "@root", @workerTools)
exe llm @callDecisionAgent(context) = @claudePoll(@decisionPrompt(@context), "opus", "@root", @decisionTools)

loop(endless) [
  let @context = @buildContext(@config, @runDir)
  let @decision = @callDecisionAgent(@context)
  when @decision.action [
    "work" => [...]
    "create_issue" => [...]
    "close_issue" => [...]
    "blocked" => [ @writeQuestions(...); done ]
    "complete" => done
  ]
]
```

## Project Layout: the `llm/` Convention

The `llm/` directory is the standard home for LLM workflows in any mlld project — the equivalent of `src/` for application code.

```
project/
├── llm/
│   ├── run/                     # Scripts for `mlld run <name>`
│   │   └── my-pipeline/         # Each pipeline gets a subdirectory
│   │       └── index.mld        # Entry point
│   ├── mcp/                     # MCP tool modules (`mlld mcp` auto-serves this dir)
│   ├── agents/                  # Agent definitions
│   ├── prompts/                 # Shared prompt templates
│   └── lib/                     # Shared utilities
├── mlld-config.json             # Created by `mlld init`
└── ...
```

`mlld run <name>` looks in `llm/run/<name>/` for an `index.mld`. `mlld mcp` with no arguments serves every module in `llm/mcp/`.

### Orchestrator File Layout

Orchestrators live in `llm/run/` and follow this internal structure:

```
llm/run/my-orchestrator/
├── index.mld                    # Entry point — main loop
├── lib/
│   ├── context.mld              # State management, context gathering
│   └── [domain].mld             # Domain-specific helpers
├── prompts/
│   ├── decision/
│   │   └── core.att             # Decision agent prompt template
│   ├── workers/
│   │   ├── [role].att           # One template per worker type
│   │   └── verify.att            # Verification worker (expanded tools)
│   └── shared/
│       └── [fragment].md        # Reusable prompt fragments
└── schemas/
    ├── decision.json            # Decision output JSON Schema
    └── worker-result.json       # Worker output JSON Schema
```

## State Management

### Primary: LLM Cache + Checkpoints

Label LLM calls and mark phase boundaries. The checkpoint system handles crash recovery and resumption automatically.

```mlld
>> Label LLM calls — caching is automatic
exe llm @review(prompt) = @claudePoll(@prompt, "sonnet", "@root", @tools)

>> Mark phase boundaries
checkpoint "collection"
var @data = for parallel(20) @item in @items => @collect(@item)

checkpoint "analysis"
var @results = for parallel(20) @item in @items => @analyze(@item)
```

```bash
mlld run pipeline                      # auto-resumes via cache
mlld run pipeline --resume "analysis"  # skip to analysis phase
mlld run pipeline --resume @analyze    # re-run all @analyze calls
mlld run pipeline --new                # fresh run, clear cache
```

### When you also need event logs: Decision Context

For decision-loop orchestrators where the LLM agent needs to see what happened, event logs serve as **data for the decision agent**, not as a resumption mechanism. The checkpoint cache handles resumption.

```mlld
exe @logEvent(runDir, eventType, data) = [
  let @event = { ts: @now, event: @eventType, ...@data }
  append @event to "@runDir/events.jsonl"
]

exe @loadRecentEvents(runDir, limit) = [
  let @lines = @tailFile(`@runDir/events.jsonl`, @limit)
  => for @line in @lines.split("\n") when @line.trim() => @line | @json
]
```

Use event logs when the decision agent reads recent history to inform its next action (the development/j2bd archetype). For linear pipelines (the audit archetype), event logs are unnecessary — the checkpoint cache handles everything.

### Run state for decision agents

Decision-loop orchestrators that track cross-iteration state (last worker result, last error) still use `run.json`:

```json
{
  "id": "2026-02-09-0",
  "created": "2026-02-09T10:00:00Z",
  "lastResult": null,
  "lastError": null
}
```

This is program state the decision agent reads, not resumption infrastructure.

## File-Based Output Protocol

Tell the LLM to write structured output to a specific file path. Don't parse streaming output.

```mlld
let @outputPath = `@runDir/decision-@iteration.json`
let @fullPrompt = `@prompt

IMPORTANT: Write your JSON response to @outputPath using the Write tool.`

let @_ = @claudePoll(@fullPrompt, "opus", "@root", @tools, @outputPath)
let @decision = <@outputPath>?
```

The orchestrator reads the file after the agent finishes. The file doubles as a debugging artifact.

## Template Composition

Prompts are `.att` template files with `@variable` interpolation. Declared as executables:

```mlld
exe @decisionPrompt(tickets, events, lastError) = template "./prompts/decision/core.att"
exe @workerPrompt(task, guidance, context) = template "./prompts/workers/implement.att"
```

Inside `.att` files, use XML-tagged sections for structured context:

```
<tickets>
@tickets
</tickets>

<recent_events>
@recentEvents
</recent_events>

<last_error>
@lastError
</last_error>
```

## Context Conventions

Standard XML-tagged sections in decision prompts:

| Section | Purpose |
|---------|---------|
| `<goal>` | What we're trying to accomplish |
| `<state>` | Current state: open issues, file inventory |
| `<history>` | Recent events from events.jsonl |
| `<last_result>` | Output from the previous action |
| `<last_error>` | Error from last iteration (if any) |
| `<constraints>` | Hard limits, budgets, rules |

Use selective context loading — only load what the current job needs.

## Structured Actions with JSON Schema

Decision agents return one action type. Use conditional JSON Schema:

```json
{
  "required": ["reasoning", "action"],
  "allOf": [
    {
      "if": { "properties": { "action": { "const": "work" } } },
      "then": { "required": ["task", "guidance"] }
    },
    {
      "if": { "properties": { "action": { "const": "blocked" } } },
      "then": { "required": ["questions"] }
    },
    {
      "if": { "properties": { "action": { "const": "complete" } } },
      "then": { "required": ["summary"] }
    }
  ]
}
```

The orchestrator switches mechanically on `decision.action`. No interpretation.

## Tool Permissions Per Role

Different agents get different tool sets:

```mlld
var @decisionTools = "Read,Write,Glob,Grep"
var @workerTools = "Read,Write,Edit,Glob,Grep,Bash(git:*),Bash(npm:*)"
```

Decision agents: read + write (for output file). Workers: full access scoped to needs.

## Parallel Processing

Use `for parallel(N)` for batch operations. The `llm` label makes each call independently cached — no manual idempotency checks needed.

```mlld
exe llm @review(file) = @claudePoll(@reviewPrompt(@file), "sonnet", "@root", @tools)

var @results = for parallel(20) @file in @files => @review(@file)
```

Crash at item 47 out of 100? Re-run. Items 1-46 are instant cache hits.

**When to parallelize**: Independent items (file reviews, assessments, invalidation checks).
**When to sequence**: Data dependencies (synthesis depends on assessments, decisions depend on prior state).

## Idempotency

The LLM cache handles idempotency automatically for `llm`-labeled calls. Each call is cached by argument hash — same args return the cached result without calling the LLM.

Manual idempotency checks (`<@outPath>?`) are only needed for non-LLM side effects (file writes, shell commands) that you don't want to repeat.

## Human Handoff

When blocked, write structured questions and exit cleanly:

```mlld
"blocked" => [
  @writeQuestionsFile(@runDir, @decision.questions)
  show `Resume with: mlld run myorch`
  done
]
```

Human answers at their leisure. Re-run the script — the cache auto-resumes past completed work. For phase targeting: `mlld run myorch --resume "phase-name"`. Decision agent reads answers from context and continues.

## Model Selection

- **Sonnet**: Routing decisions, classification, assessment, review. Fast and cheap.
- **Opus**: Judgment calls, synthesis, adversarial verification, complex implementation. Slower but more capable.

Audit archetype: sonnet for everything (simple, parallel).
Research archetype: sonnet for assessment, opus for synthesis and invalidation.
Development archetype: opus for decisions and workers (high-stakes).

## Debugging

- **Hook-based observability**: Use hooks to log LLM calls with cache status — replaces manual event logging for instrumentation.
- **Prompt archival**: Save worker prompts to `@runDir/worker-*.prompt.md` for replay.
- **File-based output**: Decision/worker JSON files persist in the run directory.
- **`MLLD_DEBUG_CLAUDE_POLL=1`**: Diagnostics for `@claudePoll` polling behavior.

```mlld
>> Hook: log every LLM call with cache status
hook @trace after op:exe = [
  if @mx.op.labels.includes("llm") [
    show `  @mx.op.name | cached: @mx.checkpoint.hit`
  ]
]

>> Save prompt for debugging
output @workerPrompt to "@runDir/worker-@task-@iteration.prompt.md"
```

## Phase Management

Two approaches for two archetypes:

**Linear pipelines (audit archetype)**: Use named `checkpoint` directives between phases. The script runs top-to-bottom; `--resume "phase-name"` skips to a phase.

```mlld
checkpoint "review"
var @results = for parallel(20) @file in @files => @review(@file)

checkpoint "verify"
var @verified = for parallel(20) @finding in @results => @verify(@finding)
```

**Decision-loop orchestrators (research/development archetypes)**: The decision agent infers the current phase from what exists rather than tracking phase in code:

```
Infer phase from filesystem state:
1. No assessments/ → discovery phase
2. assessments/ incomplete → assessment phase
3. All assessed, no synthesis.json → synthesis phase
4. synthesis.json exists → invalidation phase
```

Put this logic in the decision prompt. The orchestrator never checks what phase it's in. Checkpoints are not needed inside `loop(endless)` — the LLM cache handles crash recovery call-by-call.

## LLM-First Principles

1. Dumb orchestrator — code gathers context, model decides
2. Fresh decision calls — full context each iteration, no chat history
3. Structured actions — JSON with action type, orchestrator switches mechanically
4. Prompts over predicates — rules in prompts, not if-else in code
5. Multi-phase via checkpoints or prompts — use `checkpoint` directives for linear pipelines; let decision agents track phases via prompts for loop-based orchestrators
6. Edge cases in prompts — add guidance text, not conditionals
7. File-based output — write JSON to path, don't parse streams
8. External state — separate state management from orchestration

For the full design philosophy with 17 principles and worked examples, see `/mlld:llm-first`.

See `anti-patterns.md` for traps to avoid.
See `syntax-reference.md` for mlld syntax cheat sheet.
See `gotchas.md` for mlld language gotchas and sharp edges.

## Getting Started

To scaffold a new orchestrator: `/mlld:scaffold`.

To learn by example: read the three archetypes in [../../examples/](../../examples/).
