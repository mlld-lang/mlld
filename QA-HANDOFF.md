# QA Polish Flywheel - Session Handoff

## Session Progress (2026-01-11 Evening)

### Completed

1. **Removed default timeout from `mlld run`** - Commit `8f5452fed`
   - Now unlimited by default
   - `--timeout` accepts human-readable durations: `5m`, `1h`, `30s`

2. **Created `qa-reconcile.mld`** - Pure mlld script
   - Reviews QA failures with Opus
   - Categorizes as: `genuine-bug`, `qa-error`, `doc-hallucination`, `missing-feature`, `unclear-docs`
   - Outputs `reconciliation.json` per experiment
   - 26 experiments reconciled so far

3. **Created `polish.mld`** - The QA flywheel orchestrator
   - Pure mlld (no js{}/sh{} blocks)
   - Loop: reconcile → analyze → fix until stable
   - Uses file globs and for-when filtering

4. **Updated `qa-analyze-prompt.att`**
   - Added confidence scoring (0.0-1.0)
   - Added design_fit assessment (high/medium/low)
   - Added auto_approve criteria for Opus to self-approve fixes

### Key Finding: QA Results Breakdown

From 26 reconciled experiments:

| Verdict | Count | Action |
|---------|-------|--------|
| qa-error | 14 (54%) | fix-docs |
| genuine-bug | 8 (31%) | implement |
| doc-hallucination | 2 (8%) | fix-docs |
| unclear-docs | 1 | fix-docs |
| missing-feature | 1 | fix-docs |

**Insight**: Most "failures" were QA methodology errors or doc issues, not code bugs. The docs were embellished during reorg - promising features that don't exist.

### 8 Genuine Bugs Identified

All trivial/low complexity:
1. `foreach/04-M-empty-array` - Empty arrays throw error
2. `foreach/05-M-nested-arrays` - Display formatter only 1 level deep
3. `foreach/02-L-foreach-with-separator` - Wrong AST property path
4. `comments/10-H-empty-comments` - Empty comments consume next line
5. `when-blocks/06-H-empty-block` - Empty block parse error
6. `when-blocks/05-M-side-effects` - Let in when block breaks
7. `modules-exporting/07-H-circular-imports` - Infinite recursion
8. `for-block/05-M-nested-for-blocks` - Nested for-blocks unsupported

---

## Bug Filed This Session

**mlld-egb3** (P1): for-when inside exe blocks returns wrapped object instead of array
- `.length` fails on result
- Workaround: do filtering at top-level var, not inside exe blocks

---

## Architecture: Polish Flywheel

```
┌────────────────────────────────────────────────────────┐
│                    QA FLYWHEEL                         │
│                                                        │
│   ┌─────┐    ┌───────────┐    ┌─────────┐    ┌─────┐ │
│   │ QA  │───▶│ Reconcile │───▶│ Analyze │───▶│ Fix │ │
│   └──▲──┘    └───────────┘    └────┬────┘    └──┬──┘ │
│      │                             │            │     │
│      │         ┌───────────────────┘            │     │
│      │         ▼                                │     │
│      │   ┌───────────┐                          │     │
│      │   │  Decide   │  (Opus auto if >90%)     │     │
│      │   └─────┬─────┘                          │     │
│      │         │                                │     │
│      └─────────┴────────────────────────────────┘     │
│                                                        │
│   Stops when: no new failures, all tiers stable        │
└────────────────────────────────────────────────────────┘
```

### Files

| File | Purpose |
|------|---------|
| `llm/run/polish.mld` | Main flywheel orchestrator |
| `llm/run/qa.mld` | QA test generation |
| `llm/run/qa-reconcile.mld` | Failure categorization |
| `llm/run/qa-reconcile-prompt.att` | Reconciliation prompt |
| `llm/run/qa-analyze.mld` | Deep bug analysis |
| `llm/run/qa-analyze-prompt.att` | Analysis prompt with confidence scoring |

---

## Remaining Work: Parallel Fix Path with Worktrees

### Problem

Fixes need to:
1. Modify code
2. Add/update tests per `docs/dev/TESTS.md`
3. Update docs per `docs/dev/DOCS.md`
4. Commit changes

Sequential is slow. Parallel has git conflicts.

### Solution: Use `wt` (worktrees)

[worktrunk.dev](https://worktrunk.dev/) - Git worktree management tool

**Architecture:**

```
Phase 1: Parallel Fix Application (in worktrees)
┌─────────────────────────────────────────────────────────┐
│  For each auto-approved fix:                            │
│    1. wt create fix-<topic>-<experiment>                │
│    2. Opus agent works in worktree:                     │
│       - Apply code changes                              │
│       - Add/update tests (per TESTS.md)                 │
│       - Update docs if needed (per DOCS.md)             │
│       - Run tests: npm test                             │
│       - Commit if tests pass                            │
│    3. Write fix-result.json with status                 │
└─────────────────────────────────────────────────────────┘

Phase 2: Sequential Merge (single Opus)
┌─────────────────────────────────────────────────────────┐
│  Single Opus reviews all worktrees:                     │
│    1. List completed worktrees                          │
│    2. For each successful fix:                          │
│       - Review changes                                  │
│       - Merge to main branch                            │
│       - Resolve conflicts if any                        │
│    3. Clean up merged worktrees                         │
└─────────────────────────────────────────────────────────┘
```

### Implementation TODO

1. [ ] Update `polish.mld` Phase 3 to use worktrees:
   ```mlld
   >> Create worktree for each fix
   for parallel(10) @fix in @autoApproved [
     run cmd {wt create fix-@fix.topic-@fix.experiment}
     let @prompt = @buildFixPrompt(@fix, worktreePath)
     let @result = @claude(@prompt, "opus", @worktreePath, "Read,Write,Edit,Bash,Glob,Grep")
     => @fix
   ]
   ```

2. [ ] Create fix prompt that includes:
   - Code changes from proposed-fix.json
   - Test requirements from TESTS.md
   - Doc requirements from DOCS.md
   - Commit message format
   - ONLY commit if tests pass

3. [ ] Add Phase 4 to `polish.mld`: Merge worktrees
   ```mlld
   >> Single Opus merges all successful fixes
   let @mergePrompt = @buildMergePrompt(@completedWorktrees)
   let @result = @claude(@mergePrompt, "opus", @base, "Read,Write,Edit,Bash,Glob,Grep")
   ```

4. [ ] Update `qa-analyze-prompt.att` to output more structured code_changes:
   ```json
   {
     "code_changes": [{
       "file": "path/to/file.ts",
       "line_start": 123,
       "line_end": 130,
       "before": "exact code to replace",
       "after": "exact replacement code"
     }],
     "test_changes": [{
       "type": "add_fixture",
       "path": "tests/cases/feat/...",
       "files": ["example.md", "expected.md"]
     }],
     "doc_changes": [{
       "type": "update_atom",
       "path": "docs/src/atoms/..."
     }]
   }
   ```

### Commit Requirements

Fixes should ONLY be committed if:

**For code changes:**
- [ ] Tests added/updated per `docs/dev/TESTS.md`
- [ ] New fixture in `tests/cases/` if behavior change
- [ ] `npm test` passes

**For doc changes:**
- [ ] Updated per `docs/dev/DOCS.md`
- [ ] LLM docs: atoms in `docs/src/atoms/`
- [ ] User docs: `docs/user/`
- [ ] Dev docs: `docs/dev/` if architecture change

### Commit Message Format

```
fix(<topic>): <brief description>

<detailed explanation>

Fixes: qa/<topic>/<experiment>
Confidence: 0.95
Design-fit: high

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Quick Start for Next Session

```bash
# See current state
find qa/ -name "reconciliation.json" | wc -l  # reconciled count
find qa/ -name "proposed-fix.json" | wc -l    # analyzed count

# Continue reconciliation (74 remaining)
mlld run qa-reconcile --limit 20

# View genuine bugs pending analysis
find qa/ -name "reconciliation.json" -exec grep -l '"verdict": "genuine-bug"' {} \; | \
  while read f; do [ ! -f "$(dirname $f)/proposed-fix.json" ] && echo "$f"; done

# Test the flywheel (1 iteration)
mlld run polish --maxIterations 1
```

---

## Related Beads

| Bead | P | Issue |
|------|---|-------|
| mlld-egb3 | P1 | for-when inside exe blocks returns wrapped object |
| mlld-7wx6 | P1 | Empty array [] in when-first |
| mlld-27r5 | P1 | Ternary with method calls |
| mlld-hat8 | P1 | Negation ! with method results |

---

## Design Decisions

1. **Opus for reconciliation** - Needs grounded judgment, not just pattern matching
2. **Auto-approve threshold: 90% confidence + high/medium design fit** - Conservative enough to be safe
3. **Sequential merges** - Avoids complex conflict resolution
4. **Worktrees for parallelism** - Clean isolation, easy cleanup
5. **Pure mlld scripts** - Dogfooding + showcasing capabilities
