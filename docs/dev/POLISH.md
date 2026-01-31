---
updated: 2026-01-31
tags: #arch, #qa, #pipeline
related-docs: docs/dev/DOCS-DEV.md
related-code: llm/run/polish/**/*.mld, llm/run/polish/lib/*.mld
---

# QA & Polish Pipeline

## tldr

```bash
mlld run polish                   # Grind on existing tickets
mlld run polish --batch 10        # Process more items per batch
mlld run polish --loop            # Keep processing until done
```

## Principles

- **Marker files for polling, events for state**: Claude writes to marker files, we append events ourselves
- **Resumable runs**: All state in dated directories, append-only JSONL logs
- **Parallel-safe**: Agents work in isolated worktrees, progress tracked via events.jsonl
- **Ticket lifecycle**: verify phase handles closing tickets and cleaning worktrees

## Details

### State Management

```
Claude writes → marker file (e.g. m-24a0-analysis.json)
We poll for   → marker file via @claudePoll
We read       → marker file contents
We append     → event to events.jsonl via @logEvent
```

This gives us control over the append operation while using existing polling.

### Event Types

| Phase | Marker File | Event Type |
|-------|-------------|------------|
| apply (analyze) | `<id>-analysis.json` | `analysis_done` |
| apply (fix) | `<id>-result.json` | `apply_done` |
| merge | `merge-batch-N.json` | `merge_batch_done` |
| verify | `verification-result.json` | `verify_done` |
| enrich | `<id>-enrich.json` | `enrich_done` |

### Execute Phase Model

Three stages for safe code changes:

```
4a: Apply (parallel)   Analyze + apply fixes in isolated worktrees
4b: Merge (sequential) Merge verified worktrees to main
4c: Verify             Run tests, close tickets, cleanup worktrees
```

Ticket lifecycle handled in verify:
- Tests pass → `tk close` + `wt remove`
- Tests fail → `tk tag verify-failed` + preserve worktrees

### Directory Structure

```
llm/run/polish/
  index.mld               # Orchestrator
  phases/
    interpret.mld         # Human answers → classifications
    reconcile.mld         # Merge QA + tickets
    enrich.mld            # Stale/scope/impl assessment
    rank.mld              # Clustering + prioritization
    execute.mld           # Execute orchestrator
    execute/
      apply.mld           # Analyze + apply (parallel)
      merge.mld           # Merge worktrees (sequential)
      verify.mld          # Test + close + cleanup
  lib/
    events.mld            # @logEvent, @loadEvents, @getVerifiedNotMerged
    tickets.mld           # tk CLI wrapper
    state.mld             # Run/phase state

pipeline/
  current -> YYYY-MM-DD-N/
  YYYY-MM-DD-N/
    events.jsonl          # Append-only progress
    execute/
      <id>-analysis.json  # Marker files
      <id>-result.json
      merge-batch-N.json
      verification-result.json
```

### Key Functions (events.mld)

- `@logEvent(runDir, event)` - Append event with timestamp
- `@loadEvents(runDir)` - Load all events as array
- `@getVerifiedNotMerged(events)` - Find items ready to merge
- `@logMergeDone(runDir, id, sha)` - Log successful merge
- `@logManualReview(runDir, id, phase, reason, details)` - Surface for human review

### Manual Review Routing

Tickets tagged `needs-human-design` are filtered out in reconcile phase before any work is done.

For items that reach execute, Chesterton's Fence safeguards catch design concerns:

```
execute-analyze.att  →  auto_approve: false + design_question
                     ↓
apply.mld:120-133    →  terminates work, calls @logManualReview()
                     ↓
events.mld:97-112    →  writes to <run-id>-manual-review-reqd.jsonl in root
```

The analysis includes `recommendation.design_question` if the agent suspects intentional design.

**QA path**: Items classified as `needs-human-design` during QA go through the strategy questions process instead (human answers in `strategy-questions.md`).

## Gotchas

- `when` returns a value; use `if` blocks with `=>` for early exe returns
- Ternary `x ? y : z` not supported in let assignments (use `when` or `if`)
- `sh {}` blocks use shell `$var` syntax—pass via exe params
- `@json` is reserved—don't use as variable name

## Debugging

```bash
# Check events
cat pipeline/current/events.jsonl | jq -c 'select(.event == "item_done")'

# Find unmerged verified items
cat pipeline/current/events.jsonl | jq -c 'select(.event == "item_done" and .verified)'

# Check manual review queue
cat *-manual-review-reqd.jsonl 2>/dev/null | jq -c .
```
