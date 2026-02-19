---
name: mlld:agents
description: Building LLM agents with mlld — tool agents (MCP tools), event-driven agents (routers and dispatchers), and workflow agents (stateless jobs). Use when creating agents, exposing tools, or building event-driven systems.
---

## Prerequisites

**IMMEDIATELY AFTER READING THIS SKILL, YOU MUST RUN `mlld howto intro` before writing any mlld code.** The intro covers syntax, gotchas, built-in methods, file loading, and common traps. Skipping it leads to inventing non-existent features and writing code that validates but fails at runtime.

```bash
mlld howto intro              # Language fundamentals — read this first
mlld init                     # Initialize project (enables mlld run)
mlld install @mlld/claude-poll  # Install the Claude polling module
```

It is *strongly* encouraged to view at least one of the examples in `plugins/mlld/examples/` before writing an agent — `tool-agent/`, `event-agent/`, and `workflow-agent/` each demonstrate a different paradigm.

## Agent Paradigms

Three ways to build agents with mlld, each for a different integration pattern:

| Paradigm | What it is | When to use |
|----------|-----------|-------------|
| **Tool Agent** | mlld functions served as MCP tools | Another agent or system needs to call your functions |
| **Event-Driven Agent** | External event loop + mlld routing/dispatch/gating | Incoming events need to be classified and handled by specialist agents |
| **Workflow Agent** | Stateless job scripts invoked by an external system | An external system sequences steps; each step is a standalone mlld script |

Tool agents expose capabilities. Event-driven agents react to stimuli. Workflow agents do work on demand. All three compose — a workflow agent might call tool agents via MCP, and an event-driven system might dispatch workflow agents.

For pipeline orchestration (decision loops, parallel fan-out, adversarial invalidation), see `/mlld:orchestrator`.

---

## Tool Agents

A tool agent is a set of mlld functions served as MCP tools. Any MCP client (Claude Code, another agent, a custom app) can call them.

### Exporting Functions as MCP Tools

Define functions with `exe`, export them, serve with `mlld mcp`:

```mlld
exe @greet(name: string) = js { return "Hello " + name; }
exe @search(query: string, limit: number) = cmd {
  gh issue list --search "@query" -L @limit --json number,title
} with { description: "Search issues by keyword" }

export { @greet, @search }
```

```bash
mlld mcp tools.mld
```

Type annotations (`string`, `number`, `boolean`, `object`, `array`) generate JSON Schema for the MCP client. The `with { description }` clause sets the tool description. Name conversion is automatic: `@greetUser` becomes `greet_user` over MCP.

Put MCP modules in `llm/mcp/`. Running `mlld mcp` with no arguments auto-serves every module in that directory.

### Tool Collections with bind/expose

`var tools` defines a collection that controls what callers see:

```mlld
exe @createIssue(owner: string, repo: string, title: string, body: string) = cmd {
  gh issue create -R @owner/@repo -t "@title" -b "@body"
}

var tools @agentTools = {
  createIssue: {
    mlld: @createIssue,
    bind: { owner: "my-org", repo: "my-repo" },
    expose: ["title", "body"],
    description: "Create a GitHub issue"
  }
}
```

- **bind**: Pre-fill parameters the caller shouldn't control. Hidden from the tool schema entirely.
- **expose**: Explicitly list which parameters the caller can set. Without `expose`, all unbound parameters are visible.
- **labels**: Attach metadata for guards (e.g., `labels: ["destructive"]`).
- **description**: Override the tool's description in MCP.

Serve a collection instead of raw exports:

```bash
mlld mcp tools.mld --tools-collection @agentTools
```

### Reshaping External MCP Servers

Import tools from an external MCP server, reshape them, re-export:

```mlld
import tools from mcp "npx @github/mcp-server" as @github

var tools @scopedGithub = {
  searchIssues: {
    mlld: @github.searchIssues,
    bind: { owner: "my-org", repo: "my-repo" },
    expose: ["query"],
    description: "Search issues in our repo"
  },
  createIssue: {
    mlld: @github.createIssue,
    bind: { owner: "my-org", repo: "my-repo" },
    expose: ["title", "body"],
    labels: ["write"],
    description: "Create an issue in our repo"
  }
}

export { @scopedGithub }
```

This narrows a broad external API to exactly what your agent needs. The caller sees `searchIssues(query)` and `createIssue(title, body)` — no way to target other repos.

### Agent-Calls-Agent Chains

Agent A can use Tool Agent B as an MCP server. Configure in `.mcp.json` or `agent-config.json`:

```json
{
  "mcpServers": {
    "project-tools": {
      "command": "npx",
      "args": ["mlld", "mcp", "llm/mcp/toolkit.mld", "--tools-collection", "@toolkit"]
    }
  }
}
```

Each agent sees only its configured tool collection. Composition happens through MCP — Agent A doesn't know Agent B is mlld, just that it provides tools.

### Guards for Tool Security

Guard declarations intercept tool calls based on labels:

```mlld
guard @blockDestructive before op:exe = when [
  @mx.op.labels.includes("destructive") => deny "Destructive operations blocked"
  * => allow
]
```

All MCP tool inputs carry `src:mcp` taint automatically. Guards can check taint to restrict what MCP-originated data can do. Full security patterns (taint tracking, policy enforcement, flow restrictions) are covered in separate documentation — see `mlld howto mcp-security`.

**See**: `examples/tool-agent/`

---

## Event-Driven Agents

An event-driven agent system reacts to incoming events (messages, tasks, webhooks). An external event loop watches for events. mlld handles routing, dispatch, and quality gating.

### Architecture

```
Event Source → Event Loop (TypeScript) → mlld Orchestrator
                                          ├── Router (which agent?)
                                          ├── Dispatch (call agent)
                                          └── Gate (quality check)
                                               └── Output
```

The event loop is plumbing. The intelligence lives in mlld.

### Event Loop (TypeScript)

The event loop watches for events and calls mlld for each one:

```typescript
import { execSync } from 'child_process';
import { watch, existsSync, readdirSync } from 'fs';

watch('tasks/pending', (eventType, filename) => {
  if (filename?.endsWith('.json') && existsSync(`tasks/pending/${filename}`)) {
    execSync(`mlld index.mld --task "tasks/pending/${filename}" --output "tasks/done/${filename}"`, {
      stdio: 'inherit',
      timeout: 300_000
    });
  }
});
```

Key design choices:
- **Sequential processing**: Message N finishes before N+1 starts (prevents incoherent interleaving)
- **mlld does the thinking**: The TS loop just watches and invokes
- **File-based handoff**: Task JSON in, result JSON out

The event source can be anything: filesystem watcher, message queue, webhook endpoint, polling loop. The pattern is the same — read event, call mlld, handle result.

### Router Pattern

The router receives an event and decides which agent handles it:

```mlld
exe @routeTask(task, agents) = [
  let @agentSummary = for @a in @agents => `@a.id: @a.capabilities`

  >> Fast classification with haiku
  let @outPath = `@root/tmp/router-@task.id\.json`
  let @prompt = @scorePrompt(@task, @agentSummary.join("\n"))
  let @_ = @claudePoll(@prompt, "haiku", "@root", "Read,Write", @outPath)
  let @result = <@outPath>? | @json

  >> Low confidence → refine with stronger model
  when @result.confidence == "low" [
    let @refined = ... >> call sonnet
    when @refined => @refined
  ]

  => @result
]
```

Router design principles:
- **Cheap first, expensive if needed**: Haiku for obvious routing, Sonnet for ambiguous cases
- **Score, don't classify**: Return confidence levels so the system can escalate
- **Agent registry as data**: Agents describe their own capabilities; the router reads them

### Gate Pattern

The gate checks agent output quality before finalizing:

```mlld
exe @checkOutput(task, output) = [
  let @outPath = `@root/tmp/gate-@task.id\.json`
  let @prompt = @checkPrompt(@task, @output)
  let @_ = @claudePoll(@prompt, "haiku", "@root", "Read,Write", @outPath)
  let @result = <@outPath>? | @json
  when !@result => { pass: true, feedback: null }
  => @result
]
```

Gate design principles:
- **Strict on substance**: Reject empty acknowledgments and generic filler
- **Fail with feedback**: When rejecting, explain what's missing so a retry can succeed
- **Default to pass on gate failure**: If the gate itself errors, let the output through rather than silently dropping it

Integrate the gate with pipeline `=> retry` so the agent automatically retries with feedback:

```mlld
exe @callAgent() = [
  let @feedback = @mx.hint ? `\n\nPrevious attempt rejected: @mx.hint` : ""
  >> ... build prompt with @feedback, call @claudePoll ...
  => <@outPath>?
]

exe @qualityGate() = [
  if !@mx.input [ => { status: "failed" } ]
  let @gate = @checkOutput(@task, @mx.input)
  if @gate.pass [ => @mx.input ]
  if @mx.try < 3 [ => retry @gate.feedback ]
  => { status: "failed", reason: "gate_retry_failed" }
]

var @result = @callAgent() | @qualityGate
```

The gate's feedback flows to the source via `@mx.hint`, where the agent appends it to the prompt before retrying. See `examples/event-agent/` for the full working implementation.

### Agent Contracts

Agents follow a convention-based contract. Each agent module exports:

```mlld
var @meta = {
  id: "classifier",
  name: "Classifier Agent",
  capabilities: "Categorizes and tags tasks by type, urgency, and domain"
}

exe @taskPrompt(task) = template "./prompts/agents/classify.att"

export { @meta, @taskPrompt }
```

The orchestrator loads all agent modules, reads their `@meta` for the router, and calls their `@taskPrompt` for dispatch. Adding a new agent = adding a new module file and prompt template.

**See**: `examples/event-agent/`

---

## Workflow Agents

A workflow agent is a stateless mlld script invoked by an external system (Rails, Node, cron, CI). It reads input, does work, writes output, and exits. No loop, no state management, no orchestration.

### Stateless Jobs

Every workflow agent follows the same shape:

```mlld
import { @claudePoll } from @mlld/claude-poll
import "@payload" as @p

>> Parse input
var @input = <@p.inputFile> | @json

>> Do work (one or more LLM calls)
var @prompt = @myPrompt(@input)
var @_ = @claudePoll(@prompt, "sonnet", "@root", @tools, @outputPath)
var @result = <@outputPath>?

>> Write output
output @result to "@p.outputFile"
```

The external system decides *when* to call each job and *what order* to run them. The mlld script just does its part.

### Job Taxonomy

Four types of jobs, distinguished by what they do:

**Analysis** — Read-only insight extraction. Single LLM call. Pure function.
```
Input: document → Output: findings, classifications, assessments
```

**Decision** — Two-call deliberation. Separates generation from evaluation.
```
Input: context → Call 1: options → Call 2: evaluation → Output: chosen option + reasoning
```

**Synthesis** — Combine multiple inputs into a new artifact.
```
Input: multiple results → Output: summary, report, combined view
```

**Communication** — Transform data into human-readable output.
```
Input: structured data → Output: formatted message, report, notification
```

### Two-Call Deliberation

The key pattern for decision jobs. Separating generation from evaluation prevents anchoring bias — the evaluator doesn't know which option the generator "liked."

```mlld
>> Call 1: Generate options (no bias, no ranking)
var @genPrompt = @generatePrompt(@context)
var @_ = @claudePoll(@genPrompt, "sonnet", "@root", @tools, @optionsPath)
var @options = <@optionsPath>? | @json

>> Call 2: Evaluate and choose (critical judgment)
var @evalPrompt = @evaluatePrompt(@context, @options)
var @_ = @claudePoll(@evalPrompt, "opus", "@root", @tools, @outputPath)
var @decision = <@outputPath>? | @json
```

Use Sonnet for generation (explores broadly, fast) and Opus for evaluation (careful judgment, worth the cost). The generation prompt says "do NOT rank" — evaluation is the second call's job.

### Shared Templates

Jobs in the same workflow share prompt templates for common patterns:

```
prompts/
├── shared/
│   └── output-format.md         # Standard output conventions
├── analyze/
│   └── extract.att              # Analysis-specific
├── decide/
│   ├── generate.att             # Generation (call 1)
│   └── evaluate.att             # Evaluation (call 2)
└── summarize/
    └── combine.att              # Synthesis-specific
```

Shared fragments (like output format, evidence rules) are loaded with alligator syntax and interpolated into prompts:

```mlld
var @outputFormat = <./prompts/shared/output-format.md>
var @fullPrompt = `@prompt

@outputFormat`
```

### External Invocation

Workflow agents are designed to be called from any system:

```bash
# From CLI
mlld jobs/analyze.mld --input doc.md --output analysis.json

# From Node/Rails/Python
execSync('mlld jobs/decide.mld --input context.json --output decision.json');

# From another mlld script
cmd { mlld jobs/summarize.mld --inputs "results/*.json" --output summary.json }
```

The `import "@payload" as @p` pattern parses CLI arguments into a structured object.

**See**: `examples/workflow-agent/`

---

## The `llm/` Directory Convention

Standard project layout for LLM workflows:

```
project/
├── llm/
│   ├── run/                     # Scripts for `mlld run <name>`
│   │   └── my-pipeline/
│   │       └── index.mld
│   ├── mcp/                     # MCP tool modules (`mlld mcp` auto-serves this dir)
│   ├── agents/                  # Agent definitions
│   ├── prompts/                 # Shared prompt templates
│   └── lib/                     # Shared utilities
├── mlld-config.json
└── ...
```

- `llm/run/` — Orchestrators and runnable scripts. `mlld run <name>` looks here.
- `llm/mcp/` — Tool modules. `mlld mcp` with no args serves this directory.
- `llm/agents/` — Agent definition modules with `@meta` and prompt exports.
- `llm/prompts/` — Shared `.att` templates and `.md` prompt fragments.
- `llm/lib/` — Shared mlld utilities (`@logEvent`, `@claudePoll` wrappers, etc.).

## Getting Started

To scaffold a new orchestrator that coordinates your agents, use `/mlld:scaffold`.

For pipeline orchestration (decision loops, parallel fan-out, adversarial invalidation), see `/mlld:orchestrator`.

Use `mlld howto mcp` for MCP-specific patterns.

See `patterns.md` for cross-cutting patterns that apply across all agent paradigms.
