---
updated: 2026-02-03
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
- **Documentation integrity** - Workers fix implementations to match docs, never lower docs to match implementations. Descoping requires human approval via `blocked` action
- **Adversarial verification** - Claims must be proven with execution evidence before completion. The adversarial worker tries to break things; only `status: "verified"` gates completion

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
- `complete` - requires re-reading the job and declaring unequivocal success

**Worker types** (`task_type` field):
- `doc` - write documentation atoms
- `impl` - implement features, fix code
- `friction` - investigate and resolve blockers
- `improvement` - enhance existing work
- `adversarial` - red team testing, tries to break claims

**Phases** (inferred by decision agent from state, not tracked in code):
1. Documentation - write atoms
2. Implementation - build features
3. Verification & Remediation - test, find gaps, fix
4. Adversarial Verification - prove claims with execution evidence

After adversarial failures: decision agent investigates code, creates targeted impl tickets, dispatches workers to fix. Only escalates to human when fixes need architectural decisions or descoping. Adversarial ticket stays open until adversarial worker returns `verified`.

## Directory Structure

```
llm/run/j2bd/
├── index.mld              # Orchestrator (~200 lines)
├── lib/
│   ├── context.mld        # Context gathering
│   └── questions.mld      # Human handoff
└── prompts/
    ├── decision.att          # Decision agent (opus)
    ├── doc-worker.att        # Doc worker
    ├── impl-worker.att       # Impl worker
    ├── friction-worker.att   # Friction worker
    └── adversarial-worker.att # Red team verification

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
  spec: `@root/path/to/spec.md`,
  docs_dir: `@root/docs/src/atoms/newtopic/`,
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
- `@mlld/claude-poll` must be available
- Tickets persist across runs. Fresh runs (`--new`) see closed tickets from prior runs. Decision prompt handles this: empty events log = must re-verify before completing
- Adversarial workers must prove failures AND successes with execution evidence. Speculation is invalid in either direction
- Complex remediation plans should be reviewed by adversarial worker before escalating to human

## Debugging

Check run state:
```bash
cat j2bd/security/runs/2026-02-01-0/events.jsonl | tail -20
cat j2bd/security/runs/2026-02-01-0/decision-N.json
cat j2bd/security/runs/2026-02-01-0/worker-TICKET-N.prompt.md
```

Adversarial test files land in `tmp/` (e.g., `tmp/adv5-test-1-secret-show.mld`). Review these to understand what was tested and how.
