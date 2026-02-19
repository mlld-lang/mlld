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

1. **Resumable** — Append progress to `events.jsonl`. Idempotency checks (`<@outPath>?`) skip completed work. Require `--new` to start a fresh run; default to resuming the latest.
2. **Parallel** — Use `for parallel(N)` wherever items are independent. Accept `--parallel n` to let the caller cap concurrency (default: 20).
3. **Observable** — Pipe LLM calls through `| log` so progress is visible. Write structured events to JSONL. Save prompts to debug files (`output @prompt to "@runDir/worker-*.prompt.md"`).
4. **Dumb** — Code gathers context and executes actions. The LLM decides everything. No if-else for business logic. See `/mlld:llm-first` for the full design philosophy.
5. **Organized** — Write logs and artifacts to `llm/output/{script-name}/YYYY-MM-DD-n` by default unless the caller specifies otherwise.

**LLM-first cheat sheet** (see `/mlld:llm-first` for details):
- Dumb orchestrator, smart decision calls — code gathers, model decides
- Fresh context each iteration — no chat history, the context IS the history
- Structured JSON actions — orchestrator switches mechanically, no interpretation
- Prompts over predicates — rules in prompts, not if-else in code
- Logs over state machines — event log shows everything, debug by reading it

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

var @files = <src/**/*.ts>
var @results = for parallel(20) @file in @files [
  @claudePoll(@reviewPrompt(@file), "sonnet", "@root", @reviewTools, @outPath)
  => <@outPath> | @json
]
>> Then verification pass with expanded tools + 4-way taxonomy
```

### 2. Research (multi-phase pipeline + invalidation)

Decision agent infers phase from filesystem state. Parallel fan-out for batch operations. Builds toward a synthesis that gets invalidated.

**Use when**: Multi-step analysis where phases depend on prior results (document analysis, research synthesis, data pipeline).

**See**: [../../examples/research/](../../examples/research/)

```mlld
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

Two files track run state:

**`run.json`** — Minimal current state. What matters right now.
```json
{
  "id": "2026-02-09-0",
  "created": "2026-02-09T10:00:00Z",
  "lastResult": null,
  "lastError": null
}
```

**`events.jsonl`** — Append-only event log. Full history for debugging.
```jsonl
{"ts":"2026-02-09T10:00:01Z","event":"run_start","topic":"security"}
{"ts":"2026-02-09T10:00:15Z","event":"iteration","decision":"work","ticket":"#42"}
{"ts":"2026-02-09T10:05:30Z","event":"worker_result","status":"completed"}
```

Context builder reads recent N events from the log for the decision agent.

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

Use `for parallel(N)` for batch operations. All examples emphasize parallelism.

```mlld
var @results = for parallel(20) @item in @items [
  let @outPath = `@runDir/results/@item.id\.json`

  >> Idempotency: skip if already done
  let @existing = <@outPath>?
  if @existing => @existing | @parse

  >> Do work...
  => @result
]
```

**When to parallelize**: Independent items (file reviews, assessments, invalidation checks).
**When to sequence**: Data dependencies (synthesis depends on assessments, decisions depend on prior state).

## Idempotency

Check if output exists before doing work. Makes reruns safe and enables resume.

```mlld
let @existing = <@outPath>?
if @existing [
  show `  Skipped: @outPath`
  => @existing | @parse
]
```

## Human Handoff

When blocked, write structured questions and exit cleanly:

```mlld
"blocked" => [
  @writeQuestionsFile(@runDir, @decision.questions)
  @logEvent(@runDir, "run_paused", { reason: "needs_human" })
  show `Resume with: mlld run myorch --run @runId`
  done
]
```

Human answers at their leisure. Human resumes. Decision agent reads answers from context and continues.

## Model Selection

- **Sonnet**: Routing decisions, classification, assessment, review. Fast and cheap.
- **Opus**: Judgment calls, synthesis, adversarial verification, complex implementation. Slower but more capable.

Audit archetype: sonnet for everything (simple, parallel).
Research archetype: sonnet for assessment, opus for synthesis and invalidation.
Development archetype: opus for decisions and workers (high-stakes).

## Debugging

- **Event logs**: `events.jsonl` shows every decision, action, and result.
- **Prompt archival**: Save worker prompts to `@runDir/worker-*.prompt.md` for replay.
- **File-based output**: Decision/worker JSON files persist in the run directory.
- **`MLLD_DEBUG_CLAUDE_POLL=1`**: Diagnostics for `@claudePoll` polling behavior.

```mlld
>> Save prompt for debugging
output @workerPrompt to "@runDir/worker-@task-@iteration.prompt.md"
```

## Phase Inference

The decision agent infers the current phase from what exists rather than tracking phase in code:

```
Infer phase from filesystem state:
1. No assessments/ → discovery phase
2. assessments/ incomplete → assessment phase
3. All assessed, no synthesis.json → synthesis phase
4. synthesis.json exists → invalidation phase
```

Put this logic in the decision prompt. The orchestrator never checks what phase it's in.

## LLM-First Principles

1. Dumb orchestrator — code gathers context, model decides
2. Fresh decision calls — full context each iteration, no chat history
3. Structured actions — JSON with action type, orchestrator switches mechanically
4. Prompts over predicates — rules in prompts, not if-else in code
5. Multi-phase via prompt — let a decision agent track phases and progress via guidance in prompts and their access to history logs rather than creating a programmatic state machine
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
