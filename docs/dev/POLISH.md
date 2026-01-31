---
updated: 2026-01-31
tags: #arch, #qa, #pipeline
related-docs: docs/dev/DOCS-DEV.md
related-code: llm/run/qa.mld, llm/run/polish/**/*.mld
---

# QA & Polish Pipeline

Automated quality assurance and fix pipeline for mlld.

## tldr

```bash
# Full cycle: QA discovers issues, polish fixes them
mlld run qa --tier 1              # Run QA on tier 1 topics
# ... human answers strategy-questions.md ...
mlld run polish                   # Fix discovered + existing issues

# Polish only (skip QA, use existing tickets)
mlld run polish --no-qa           # Grind on existing tickets
mlld run polish --batch 10        # Process more items per batch
mlld run polish --loop            # Keep processing until done
```

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         QA (Optional)                           │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: Flail        Agents test with mlld howto only        │
│  Phase 2: Self-Review  Agents re-check against tests/cookbook  │
│  Phase 3: Trends       Single agent finds cross-cutting issues │
│  Phase 4: Strategy     Generates questions for human review    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                    strategy-questions.md
                               │
                        [Human Answers]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                            Polish                               │
├─────────────────────────────────────────────────────────────────┤
│  1. Interpret    Human answers → strategy.json classifications  │
│  2. Reconcile    Merge QA findings with existing tickets       │
│  3. Enrich       Assess staleness, scope, implementation       │
│  4. Rank         Cluster related items, prioritize             │
│  5. Execute      Apply fixes, merge, verify                    │
└─────────────────────────────────────────────────────────────────┘
```

## Principles

- **Fresh perspective first**: QA agents test with limited access - their confusion = real user friction
- **Human in the loop**: Ambiguous decisions (implement vs document?) go to humans via strategy-questions.md
- **Marker files for polling, events for state**: Claude writes marker files, we append events
- **Resumable runs**: All state in dated directories, append-only JSONL logs
- **Parallel-safe**: Agents work in isolated worktrees, progress tracked via events.jsonl

## QA Phase Details

### Phase 1: Flail

Agents test features using ONLY `mlld howto` - no source code, no tests. Their genuine confusion reveals real onboarding friction.

Each topic gets experiments at L/M/H complexity levels:
- **L**: Single feature, straightforward usage
- **M**: Feature combinations, realistic workflows
- **H**: Edge cases, stress testing

Output: `qa/<run>/<topic>/*/results.json` with issues categorized as:
- `broken-promise` - Docs say X, behavior is Y
- `unclear-error` - Error message doesn't help
- `unclear-docs` - Missing or confusing explanation
- `friction` - Works but feels wrong

### Phase 2: Self-Review

Agents resume their sessions with expanded access (tests/cases/, cookbook) and reclassify issues:
- `qa-insufficient-exploration` - Answer was in docs, agent missed it
- `docs-could-be-clearer` - Reasonable confusion given the docs
- `docs-genuinely-misleading` - Docs actively wrong
- `needs-human-design` - Might be intentional, flag for human
- `genuine-bug` - Confirmed by test cases

### Phase 3: Trend Analysis

Single opus agent analyzes all results for cross-cutting patterns:
- Documentation gaps spanning multiple topics
- Common agent mistakes (prompts need improvement)
- Feature health assessment (solid vs needs-work)
- Prioritized actionable items

Output: `qa/<run>/trend-report.json`

### Phase 4: Strategy Questions

Generates `qa/<run>/strategy-questions.md` for human review:

**Auto-classified** (no human input):
- `code-fix` - Clear defect in working feature
- `doc-fix` - Docs wrong about correct behavior
- `skip` - QA process improvements only

**Needs human answer**:
- Documented feature that doesn't exist - implement or update docs?
- Partial implementation - complete it or scope docs down?
- Security behavior that could be bug or design choice

## Polish Phase Details

### 1. Interpret

Reads human answers from `strategy-questions.md` and produces `strategy.json` with classifications:
- `code-fix` - Fix bug in code
- `doc-fix` - Fix documentation
- `defer` - Human hasn't decided yet
- `skip` - No action needed

### 2. Reconcile

Merges QA classifications with existing tickets:
- Creates tickets for new QA findings
- Links QA findings to existing tickets when matching
- Filters out tickets tagged `needs-human-design`

### 3. Enrich

For each ticket, assesses:
- **Staleness**: Is issue still relevant given recent changes?
- **Implementation**: Is fix already implemented?
- **Scope**: Size (xs-xl), complexity, risk estimates

### 4. Rank

Groups related items and prioritizes:
- L/XL items are standalone
- Related XS/S/M items clustered into epics
- Ranked by priority and effort

### 5. Execute

Three stages for safe code changes:

```
5a: Apply (parallel)   Analyze + apply fixes in isolated worktrees
5b: Merge (sequential) Merge verified worktrees to main
5c: Verify             Run tests, close tickets, cleanup worktrees
```

## Manual Review Routing

Tickets tagged `needs-human-design` are filtered out in reconcile phase.

For items that reach execute, Chesterton's Fence safeguards catch design concerns:

```
execute-analyze.att  →  auto_approve: false + design_question
                     ↓
apply.mld:120-133    →  terminates work, calls @logManualReview()
                     ↓
events.mld:97-112    →  writes to <run-id>-manual-review-reqd.jsonl in root
```

## Directory Structure

```
qa/
  YYYY-MM-DD-N/
    <topic>/
      session.json            # Phase tracking
      */results.json          # Phase 1 findings
      */self_review.json      # Phase 2 reclassifications
    trend-report.json         # Phase 3 analysis
    strategy-questions.md     # Phase 4 output (human edits this)

pipeline/
  current -> YYYY-MM-DD-N/
  YYYY-MM-DD-N/
    interpret/strategy.json   # Interpreted human answers
    reconcile/merged-items.json
    enrich/enriched-items.json
    rank/work-plan.json
    execute/
      <id>-analysis.json      # Marker files
      <id>-result.json
    events.jsonl              # Append-only progress

llm/run/
  qa.mld                      # QA orchestrator
  polish/
    index.mld                 # Polish orchestrator
    phases/*.mld              # Phase implementations
    lib/*.mld                 # Shared utilities
```

## Gotchas

- `when` returns a value; use `if` blocks with `=>` for early exe returns
- Ternary `x ? y : z` not supported in let assignments (use `when` or `if`)
- `sh {}` blocks use shell `$var` syntax - pass via exe params
- `@json` is reserved - don't use as variable name

## Debugging

```bash
# Check events
cat pipeline/current/events.jsonl | jq -c 'select(.event == "item_done")'

# Find unmerged verified items
cat pipeline/current/events.jsonl | jq -c 'select(.event == "item_done" and .verified)'

# Check manual review queue
cat *-manual-review-reqd.jsonl 2>/dev/null | jq -c .

# QA phase 3 input summary
cat qa/current/phase3-input.json | jq '.topic_count, .passing, .failing'
```
