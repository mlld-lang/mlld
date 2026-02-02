---
updated: 2026-02-01
tags: #arch, #pipeline, #docs
related-docs: docs/dev/POLISH.md, docs/dev/DOCS.md, .claude/skills/llm-first.md
related-code: llm/run/j2bd/, j2bd/
---

# Job-to-Be-Done (J2BD) Pipeline

LLM-first documentation and implementation pipeline. Decision agent makes all choices; orchestrator executes.

## tldr

```bash
mlld run j2bd --topic security        # Resume most recent run
mlld run j2bd --topic security --new  # Start fresh run
mlld run j2bd --topic security --max 5  # Limit iterations
```

The orchestrator gathers context, asks a decision agent "what next?", executes that action, logs, repeats. No state machines, no phase logic—just the universal LLM-first pattern.

## Principles

See `.claude/skills/llm-first.md` for the full design philosophy. Key points:

- **Dumb orchestrator, smart decisions** - Code executes, LLM decides
- **Decision calls, not agents** - Fresh context each iteration, no persistent state
- **Prompts over predicates** - Edge cases as guidance, not conditionals
- **Workers do the work** - Write files, validate, commit, report
- **Revert + notes on failure** - Failed tests → revert → add learnings to ticket

## Architecture

```
loop:
  1. Gather context (spec, job, tickets, events)
  2. Call decision agent (opus) → ONE action
  3. Execute action (spawn worker, create ticket, close ticket, etc.)
  4. Log event
  5. Continue or exit
```

**Decision agent actions:**
- `work` - spawn worker for a ticket
- `create_ticket` - create new ticket
- `close_ticket` - close with reason
- `update_ticket` - add notes/tags
- `blocked` - exit with questions.md
- `complete` - merge and exit

**Workers:**
- Write files directly (Write tool)
- Commit their changes (git)
- Run tests, revert on failure
- Report status (not file content)

## Directory Structure

```
llm/run/j2bd/
├── index.mld              # Orchestrator (~200 lines)
├── lib/
│   ├── context.mld        # Context gathering
│   └── questions.mld      # Human handoff
└── prompts/
    ├── decision.att       # Decision agent (opus)
    ├── doc-worker.att     # Doc worker (sonnet)
    ├── impl-worker.att    # Impl worker (sonnet)
    └── friction-worker.att

j2bd/<topic>/
├── config.mld             # Topic config (spec path, docs dir, etc.)
├── jobs/                  # Job definitions
└── runs/                  # Run state (events.jsonl, decision/worker outputs)

.tickets/j2bd-<topic>/     # Tickets persist across runs
```

## CLI

```bash
mlld run j2bd --topic security                 # Resume most recent run
mlld run j2bd --topic security --new           # Start new run
mlld run j2bd --topic security --run 2026-02-01-0  # Resume specific run
mlld run j2bd --topic security --max 10        # Limit iterations
mlld run j2bd --topic security --dryRun        # No commits
```

## Creating a New Topic

```bash
mkdir -p j2bd/newtopic/jobs

# Create config
cat > j2bd/newtopic/config.mld << 'EOF'
var @config = {
  name: "newtopic",
  spec: `@base/path/to/spec.md`,
  docs_dir: `@base/docs/src/atoms/newtopic/`,
  test_command: "npm test",
  worktree_prefix: "j2bd-newtopic"
}
export { @config }
EOF

# Create job definitions in jobs/
# Run
mlld run j2bd --topic newtopic
```

## Gotchas

- Tickets use `--dir j2bd-<topic>` to isolate from other work
- Workers must commit before returning (orchestrator doesn't write files)
- `npm test` runs after commit; failures trigger revert + notes
- Nested `when` blocks don't propagate return values (m-d777)
- `@local/claude-poll` must be available

## Debugging

Check run state:
```bash
cat j2bd/security/runs/2026-02-01-0/events.jsonl | tail -20
cat j2bd/security/runs/2026-02-01-0/decision-N.json
cat j2bd/security/runs/2026-02-01-0/worker-TICKET-N.prompt.md
```

Check worktree:
```bash
cd /path/to/mlld.j2bd-security-2026-02-01-0
git log --oneline -5
git status
```
