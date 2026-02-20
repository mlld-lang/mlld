# mlld Orchestrator Conventions

Conventions for scripts in `llm/run/`, shared libraries in `llm/lib/`, and the supporting infrastructure.

## Path Aliases

Path aliases are configured in `mlld-config.json` under `resolvers.prefixes`. Use them instead of `@base/` paths for cleaner imports:

| Alias | Resolves to | Purpose |
|-------|------------|---------|
| `@lib/` | `llm/lib/` | Shared orchestrator libraries |
| `@output/` | `llm/output/` | Orchestrator run output (gitignored) |
| `@prompts/` | `llm/prompts/` | Shared prompt fragments |
| `@local/` | `llm/modules/` | Local mlld modules |
| `@devdocs/` | `docs/dev/` | Dev documentation |
| `@userdocs/` | `docs/user/` | User documentation |

```mlld
>> Use aliases — not @base paths
import { @fileExists, @mkdirp } from @lib/common
import { @logEvent } from @lib/events
import { @resolveOutputDir } from @lib/runs
var @runDir = @resolveOutputDir("my-script", @p.run)   >> resolves under @output/
var @onboarding = <@prompts/mlld-onboarding.md>
```

When adding new shared directories, register a prefix alias in `mlld-config.json` so all orchestrators can use a stable short path.

## Directory Structure

```
llm/
├── CONVENTIONS.md          # This file
├── lib/                    # Shared libraries (importable by any orchestrator)
│   ├── common.mld          # @fileExists, @mkdirp, @flatName
│   ├── events.mld          # @logEvent, @logPhaseStart, @logPhaseComplete
│   ├── runs.mld            # @today, @nextRunId, @resolveRunDir
│   └── tickets.mld         # @loadTickets, @loadTicketsByIds, @formatTickets
├── modules/                # Shared mlld modules (@mlld/claude-poll, etc.)
├── prompts/                # Shared prompt fragments (used across orchestrators)
│   ├── chestertons-fence.md
│   ├── mlld-onboarding.md
│   └── design-philosophy.md
├── output/                 # All orchestrator output (gitignored)
│   ├── review-hooks-2026-02-19-0/
│   ├── qa-2026-02-19-0/
│   ├── polish-2026-02-19-1/
│   └── ...
├── logs/                   # Runtime logs
├── run/                    # Orchestrator scripts
│   ├── review/
│   ├── qa/
│   ├── j2bd/
│   ├── polish/
│   ├── doc-audit/
│   └── doc-writer/
└── tests/                  # Test fixtures for orchestrator scripts
```

## Orchestrator Layout

Each orchestrator in `llm/run/<name>/` follows this structure:

```
llm/run/<name>/
├── index.mld              # Entry point (required)
├── lib/                   # Orchestrator-specific helpers
│   ├── context.mld        # Context gathering, domain helpers
│   ├── state.mld          # Run state management (if stateful)
│   └── ...
├── prompts/               # Prompt templates
│   ├── shared/            # Fragments reused across workers
│   │   └── evidence-rules.md
│   └── workers/           # Per-worker .att templates
│       ├── spec-compliance.att
│       └── ...
└── phases/                # Phase executables (optional)
    ├── flail.mld
    └── ...
```

**Guidelines:**
- `index.mld` is always the entry point
- `lib/` for helpers only when there are multiple or complex helpers — simple scripts can define helpers inline
- `prompts/` for `.att` templates and `.md` shared fragments
- `phases/` only for multi-phase pipelines where each phase is a distinct executable

## Output Directory

All orchestrator output goes to `llm/output/`. This directory is gitignored.

### Naming convention

```
llm/output/<name>-YYYY-MM-DD-N/
```

Where:
- `<name>` is the orchestrator name (e.g., `review-hooks`, `qa`, `polish`)
- `YYYY-MM-DD` is the run date
- `N` is a zero-based counter for multiple runs on the same day

Examples:
```
llm/output/review-hooks-2026-02-19-0/
llm/output/review-hooks-2026-02-19-1/
llm/output/qa-2026-02-20-0/
llm/output/j2bd-security-2026-02-20-0/
```

### Standard output files

Every run directory should contain:
- `events.jsonl` — append-only event log (parallel-safe)
- Phase-specific subdirectories for intermediate results

Stateful orchestrators (qa, polish, j2bd) may also maintain:
- `run.json` — run config, phase status, metadata

### Resolving the run directory

Use `llm/lib/runs.mld` helpers:

```mlld
import { @resolveOutputDir } from @lib/runs
var @runDir = @resolveOutputDir("review-hooks", @p.run)
```

This handles: create new (default), resume latest (`--run latest`), resume specific (`--run 2026-02-19-0`).

## Shared Libraries (`llm/lib/`)

Import shared helpers using the `@lib/` path alias:

```mlld
import { @fileExists, @mkdirp } from @lib/common
import { @logEvent } from @lib/events
import { @resolveOutputDir } from @lib/runs
```

### `common.mld` — filesystem utilities

```mlld
@fileExists(path)   >> Returns "yes" or "no"
@mkdirp(dir)        >> Creates directory and parents
@flatName(path)     >> Replaces "/" with "--" for safe filenames
```

### `events.mld` — event logging

```mlld
@logEvent(runDir, eventType, data)    >> Appends to events.jsonl
@logPhaseStart(runDir, phase)         >> Logs phase start
@logPhaseComplete(runDir, phase, extra)  >> Logs phase completion
```

### `runs.mld` — run directory management

```mlld
@today()                              >> Returns YYYY-MM-DD
@nextRunId(outputRoot, name)          >> Returns "name-YYYY-MM-DD-N"
@resolveOutputDir(name, runId)        >> Creates or resumes a run directory
@getLatestRun(outputRoot, name)       >> Finds most recent run for a name
```

### `tickets.mld` — ticket system integration

```mlld
@loadTickets(dir)                     >> All ready tickets from a tk directory
@loadTicketsByIds(ids)                >> Specific tickets by ID
@formatTickets(tickets)               >> Format ticket array as markdown context
```

**Rule:** If a helper is used by 2+ orchestrators, it belongs in `llm/lib/`. If it's specific to one orchestrator, keep it in that orchestrator's `lib/`.

## Config Conventions

### CLI payload parsing

All orchestrators use the same idiom:

```mlld
import "@payload" as @p

>> Required parameter — no default, validate early
var @config = @p.config
if !@config [
  show `Usage: mlld run <name> --config <path>`
  done
]

>> Optional with default
var @parallelism = @p.parallel ? @p.parallel * 1 : 5

>> Boolean flag
var @dryRun = @p.dryRun ? true : false

>> Optional string
var @filter = @p.filter ?? ""
```

### External config files

For orchestrators that accept a config file, use the j2bd pattern:

```mlld
var @configPath = @p.config
import { @config } from "@configPath"
```

Config files are `.mld` files that export a `@config` object:

```mlld
var @config = {
  name: "my-feature",
  spec: "path/to/spec.md",
  >> ... orchestrator-specific fields
}
export { @config }
```

**Config shapes are not standardized across orchestrators** — each orchestrator defines its own config schema because the inputs are genuinely different. The loading *mechanism* is standardized; the *content* is not.

### Validation

Validate required config fields early with clear error messages:

```mlld
if !@config.name [
  show `Error: config.name is required`
  done
]
```

## Prompt Conventions

### Template files

Prompt templates use `.att` files with `@variable` interpolation:

```mlld
exe @myPrompt(param1, param2, sharedFragment) = template "./prompts/workers/my.att"
```

### Shared fragments

Fragments reused across workers within an orchestrator go in `prompts/shared/`:

```mlld
var @evidenceRules = <./prompts/shared/evidence-rules.md>
```

Fragments shared across orchestrators go in `llm/prompts/` via the `@prompts/` alias:

```mlld
var @onboarding = <@prompts/mlld-onboarding.md>
```

### LLM call pattern

```mlld
let @prompt = @myTemplate(@params, @shared)
let @fullPrompt = `@prompt

IMPORTANT: Write your JSON response to @outPath using the Write tool. Write ONLY valid JSON.`

@claudePoll(@fullPrompt, "model", "@root", @tools, @outPath)
let @result = <@outPath>?
```

### Tool permissions

Define tool permission strings as variables, escalating by role:

```mlld
var @reviewTools = "Read,Write,Glob,Grep"
var @workerTools = "Read,Write,Edit,Glob,Grep,Bash(git:*),Bash(npm:*)"
```

## Idempotency & Resume

### File-existence guard

Every expensive operation should check for existing output before re-executing:

```mlld
let @exists = @fileExists(@outPath)
if @exists == "yes" [
  show `  @name: skipped (exists)`
  => <@outPath> | @json
]
>> ... expensive work ...
output @result to "@outPath"
```

### Retry-on-missing loop

For parallel fan-out phases, retry failed items:

```mlld
loop(@maxAttempts) [
  for parallel(@n) @item in @items [
    let @outPath = `@runDir/phase/@item.id\.json`
    let @exists = @fileExists(@outPath)
    if @exists == "yes" [ => null ]
    >> ... do work ...
  ]

  let @missing = for @item in @items [
    let @exists = @fileExists(`@runDir/phase/@item.id\.json`)
    if @exists != "yes" [ => 1 ]
    => null
  ]
  let @missingItems = for @x in @missing when @x => @x
  if @missingItems.length == 0 [ done ]
  show `  Retrying @missingItems.length failed items...`
  continue
]
```

## Header Comment Convention

Every `index.mld` starts with:

```mlld
>> Script Name
>> Usage: mlld run <name> [--options]
>>
>> Description of what this orchestrator does.
>>
>> Examples:
>>   mlld run <name> --option value
>>   mlld run <name> --flag
```
