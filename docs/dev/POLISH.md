---
updated: 2026-01-29
tags: #arch, #qa, #pipeline
related-docs: docs/dev/DOCS-DEV.md
related-code: llm/run/qa.mld, llm/run/polish/**/*.mld
---

# QA & Polish Pipeline

## tldr

```bash
mlld run polish                   # Grind on existing tickets
mlld run polish --batch 10        # Process more items per batch
```

For QA-driven discovery flow:

```bash
mlld run qa --tier 1              # Discovery → qa/<date>/
# [HUMAN ANSWERS strategy-questions.md]
mlld run polish --qa --batch 5    # Include QA signals → pipeline/<run>/
```

QA produces **signals** (may be hallucinated). Human review grounds them. Polish executes.

## Common Workflows

### Grind on existing tickets (default)

Work through prioritized tickets:

```bash
mlld run polish --batch 10
```

This runs: reconcile (tickets only) → enrich → rank → execute

### Process all items (loop mode)

Keep processing until work-plan is exhausted:

```bash
mlld run polish --loop
```

Loops execute phase until all items complete. Combine with parallel config:

```bash
mlld run polish --loop --batch 20 --parallel 15 --timeout 60s
```

### Continue executing a ranked run

Resume an existing run that already has ranked items:

```bash
mlld run polish --phase execute --batch 10
# Or specify a run explicitly:
mlld run polish --phase execute --run 2026-01-29-5 --batch 10
```

### Test mode (no real changes)

Validate the pipeline without making actual changes:

```bash
mlld run polish --dryRun
```

Uses haiku model, processes 2 items max, skips apply stage.

### Full QA → Polish flow

Complete workflow with QA discovery:

```bash
# 1. Run QA to discover issues
mlld run qa --tier 1

# 2. Answer strategy questions
$EDITOR qa/2026-01-29/strategy-questions.md

# 3. Execute fixes (--qa includes QA signals)
mlld run polish --qa --batch 5
```

## Principles

- **Two streams merge**: QA signals (ungrounded) + tickets (grounded work) → unified work queue
- **Human-in-the-loop**: Strategy questions require human answers before signals become actionable
- **Resumable runs**: All state in dated directories, append-only event logs
- **Parallel-safe**: Agents can work simultaneously, progress tracked via JSONL

## Details

### QA Script (`mlld run qa`)

Four-phase testing that discovers issues across mlld documentation topics:

```
Phase 1 (Flail):       Agents test with limited access (mlld howto only)
Phase 2 (Self-Review): Agents check work against tests/cookbook
Phase 3 (Trends):      Single agent analyzes results for patterns
Phase 4 (Strategy):    Generates strategy-questions.md for human review
```

**Output**: `qa/<YYYY-MM-DD>/` with per-topic results and trend analysis.

**Key flags**:
- `--tier 1|2` - Which topics to test (by qa_tier in atom frontmatter)
- `--topic <prefix>` - Filter to specific topic prefix
- `--phase 1|2|3|4|both|all` - Run specific phases
- `--run <YYYY-MM-DD>` - Resume specific run

### Polish Pipeline (`mlld run polish`)

Six-phase pipeline that processes QA signals and tickets into completed fixes:

```
Phase 0 (Interpret):  Human answers → strategy.json classifications
Phase 1 (Reconcile):  Merge QA signals + existing tickets → unified items
Phase 2 (Enrich):     Stale check + scope estimate + impl status
Phase 3 (Rank):       Cluster related items, prioritize → work-plan.json
Phase 4 (Execute):    Implement fixes in worktrees → merge to main
Phase 5 (Docs):       Doc fixes with QA validation loop
```

**Output**: `pipeline/<YYYY-MM-DD-N>/` with phase outputs and event logs.

**Key flags**:
- `--batch N` - Items per execution batch (default 5)
- `--parallel N` - Concurrent Claude calls in apply stage (default 10)
- `--timeout Ns` - Timeout per parallel item (default 10s)
- `--loop` - Keep processing until all items in work-plan complete
- `--dryRun` - Use haiku model, skip actual changes
- `--qa` - Include QA signals (requires prior `mlld run qa` + answered strategy-questions.md)
- `--phase <name>` - Run single phase
- `--run <id>` - Resume specific run

### Directory Structure

```
llm/run/
  qa.mld                    # QA orchestrator
  qa-*.att                  # QA prompt templates

  polish/
    index.mld               # Polish orchestrator
    module.yml
    phases/
      interpret.mld         # Human answers → classifications
      reconcile.mld         # Merge QA + tickets
      enrich.mld            # Stale/scope/impl assessment
      rank.mld              # Clustering + prioritization
      execute.mld           # Execute orchestrator
      execute/
        apply.mld           # Stage 4a: Analyze + apply (parallel)
        merge.mld           # Stage 4b: Merge worktrees (sequential)
        verify.mld          # Stage 4c: Test main after merges
      docs.mld              # Doc fixes with validation
    prompts/
      *.att                 # Phase prompt templates
    lib/
      state.mld             # Run/phase state management
      tickets.mld           # Ticket operations (tk CLI wrapper)
      events.mld            # JSONL event logging

qa/
  YYYY-MM-DD-N/             # QA run output
    <topic>/results.json
    trend-report.json
    strategy-questions.md   # For human review

pipeline/
  current -> YYYY-MM-DD-N/  # Symlink to active run
  YYYY-MM-DD-N/
    run.json                # Run metadata + phase status
    events.jsonl            # Append-only progress log
    interpret/strategy.json
    reconcile/merged-items.json
    enrich/enriched-items.json
    rank/work-plan.json
    execute/batch-N/        # Per-batch results
```

### Execute Phase Model

Three stages for safe code changes:

```
4a: Apply (parallel)   Analyze + apply fixes in isolated worktrees
4b: Merge (sequential) Merge verified worktrees to main + cleanup worktrees
4c: Verify             Run full test suite on main after merges
```

Each ticket gets its own git worktree for isolation. Apply stage runs items in parallel (default: 10 concurrent, 10s timeout)—each Claude agent works in its own worktree without conflicts.

After successful merge, worktrees are automatically cleaned up via `wt remove`.

Clusters (related items grouped under epic) are processed by one agent in sequence—shared context ensures coherent fixes across related tickets.

### Ranking Criteria

Priority order:
1. Priority (p0 > p1 > p2 > p3)
2. Risk (high-risk early to derisk)
3. Impl status (impl-partial cheaper to complete)
4. Bug vs feature (bugs rank higher at same priority)
5. Dependencies (unblockers rank higher)

## Gotchas

- `when condition [ => value ]` does NOT return from enclosing function—use `when first` for early returns
- `sh {}` blocks use shell `$var` syntax, not mlld `@var` interpolation—pass via exe params
- `<path>?` for optional file loads (returns null if missing, [] for empty globs)
- `@json` is reserved—don't use as variable name

## Debugging

**Test dry-run mode**:
```bash
mlld run polish --dryRun
```

**Resume failed run**:
```bash
mlld run polish --run 2026-01-28-1
```

**Check event log**:
```bash
cat pipeline/current/events.jsonl | jq -s '.'
```
