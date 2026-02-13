# Agent Patterns

Cross-cutting patterns that apply across tool agents, event-driven agents, and workflow agents.

## File-Based Communication

Agents communicate through files: JSON for structured data, markdown for prose. File paths are the universal interface between systems.

```mlld
>> Write structured output
output @result to "@outputPath"

>> Read structured input
var @input = <@inputPath> | @json

>> Append to event log
append @event to "@eventsFile"
```

File-based communication survives crashes, enables debugging (inspect the files), and works across languages (TypeScript event loop → mlld agent → JSON output).

## Payload Conventions

All agents parse CLI arguments with `import "@payload" as @p`:

```mlld
import "@payload" as @p

var @inputPath = @p.input
var @outputPath = @p.output ?? "result.json"
var @maxItems = @p.max ? @p.max * 1 : 100
```

Standard payload fields:
- `input` / `inputs` — source data path or glob
- `output` — where to write results
- `task` — task file path (event-driven)
- `run` — run ID for resume (orchestrators)

## The Two-Call Pattern

Separate generation from evaluation for high-quality decisions. Prevents anchoring — the evaluator doesn't know which option the generator preferred.

**When to use**: Any decision where bias could distort the outcome. Strategy choices, prioritization, trade-off analysis.

**When to skip**: Classification, extraction, and other tasks with clear right answers.

```mlld
>> Call 1: Explore option space (Sonnet — fast, broad)
>> Prompt says: "Generate 3-5 options. Do NOT rank them."
var @_ = @claudePoll(@genPrompt, "sonnet", ...)
var @options = <@optionsPath>? | @json

>> Call 2: Critical evaluation (Opus — careful, expensive)
>> Prompt says: "Evaluate each option. Choose one. Explain why."
var @_ = @claudePoll(@evalPrompt, "opus", ...)
var @decision = <@outputPath>? | @json
```

The generation call uses a cheaper, faster model because breadth matters more than depth. The evaluation call uses a stronger model because judgment matters more than speed.

## Agent Definition Modules

Convention for agent definitions. Each agent is an mlld module that exports metadata and prompts:

```mlld
var @meta = {
  id: "reviewer",
  name: "Reviewer Agent",
  capabilities: "Reviews and critiques work products"
}

exe @taskPrompt(task) = template "./prompts/agents/review.att"

export { @meta, @taskPrompt }
```

The orchestrator loads all agents, reads `@meta` for routing decisions, and calls `@taskPrompt` for dispatch. Adding a new agent = one new `.mld` file + one new `.att` template.

Store agent modules in `llm/agents/`.

## Tool Scoping with env Blocks

Different agents get different tool sets. Use `env` blocks to restrict tool visibility:

```mlld
env @reviewAgent with { tools: @readonlyTools } [
  run cmd { claude -p @reviewTask }
]

env @implementAgent with { tools: @fullTools } [
  run cmd { claude -p @implementTask }
]
```

Principle: minimum viable tool access. A reviewer doesn't need write tools. An analyst doesn't need shell access. Match tools to the job.

For MCP-served tools, use `--tools-collection` to serve a scoped collection:

```bash
mlld mcp tools.mld --tools-collection @readonlyTools
```

## Guard Patterns for Agents

Guards intercept operations based on labels and taint:

```mlld
>> Block destructive operations
guard @blockDestructive before op:exe = when [
  @mx.op.labels.includes("destructive") => deny "Blocked"
  * => allow
]

>> Block MCP-originated data from shell execution
guard @blockMcpExec before op:run = when [
  @mx.taint.includes("src:mcp") => deny "Cannot execute MCP-originated data"
  * => allow
]
```

Guards compose — multiple guards apply in order. A guard can be defined in one module and imported by another:

```mlld
import { @blockDestructive } from "./guards.mld"
```

For comprehensive security patterns including taint tracking and policy enforcement, see `mlld howto mcp-security` and `mlld howto mcp-guards`.

## Model Selection for Agents

Match model capability to task requirements:

| Task | Model | Reasoning |
|------|-------|-----------|
| Routing, classification, scoring | Haiku | Fast, cheap. Correct answer is usually obvious. |
| Analysis, assessment, standard work | Sonnet | Good balance. Handles most agent tasks well. |
| Judgment, synthesis, adversarial review | Opus | Worth the cost for high-stakes decisions. |
| Generation (in two-call pattern) | Sonnet | Breadth over depth. |
| Evaluation (in two-call pattern) | Opus | Depth over breadth. |
| Quality gates | Haiku | Binary pass/fail on clear criteria. |

When in doubt, start with Sonnet and upgrade to Opus if quality is insufficient.
