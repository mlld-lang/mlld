# QA Polish Flywheel - Session Handoff

## Session Progress (2026-01-12)

### Commits Made This Session

1. **`88f3c7028` - fix: when block accumulation in exe functions**
   - `when (condition) [let @x += value]` now works in exe blocks
   - Root cause: `evaluate()` didn't handle AugmentedAssignment nodes
   - Fix uses `evaluateAugmentedAssignment`/`evaluateLetAssignment` from when.ts

2. **`b2ec8e575` - fix: allow directives (show, log, run) inside when blocks**
   - Grammar fix: `ExeBlockAction` now allowed as `WhenExpressionEntry`
   - `when condition [show "x"]` now parses in exe blocks and loops

3. **`96ac27733` - feat: worktree-based parallel fix application to polish flywheel**
   - Phase 3 split into 3a (apply in worktrees), 3b (merge), 3c (verify)
   - New prompt templates for each phase

### Spot-Test Results

| Component | Status | Count |
|-----------|--------|-------|
| Phase 1 (Reconcile) | ✅ Works | 52 need reconciliation |
| Phase 2 (Analyze) | ✅ Works | 4 genuine bugs need analysis |
| Phase 3 (Apply/Merge/Verify) | ✅ Prompts ready | 10 auto-approvable |

---

## Current State

### QA Directory Stats
```bash
# Run these to see current state:
find qa/ -name "results.json" | wc -l           # total experiments
find qa/ -name "reconciliation.json" | wc -l    # reconciled
find qa/ -name "proposed-fix.json" | wc -l      # analyzed
find qa/ -name "fixed.json" | wc -l             # fixed
```

### Files in This Feature

| File | Purpose |
|------|---------|
| `llm/run/polish.mld` | Main flywheel orchestrator |
| `llm/run/qa.mld` | QA test runner |
| `llm/run/qa-reconcile.mld` | Standalone reconciliation |
| `llm/run/qa-analyze.mld` | Standalone analysis |
| `llm/run/qa-reconcile-prompt.att` | Reconciliation prompt template |
| `llm/run/qa-analyze-prompt.att` | Analysis prompt template |
| `llm/run/qa-apply-prompt.att` | Worktree apply prompt template |
| `llm/run/qa-merge-prompt.att` | Merge phase prompt template |
| `llm/run/qa-verify-prompt.att` | Verification prompt template |

---

## Next Steps: Test the Full Flywheel

### 1. Verify syntax parses
```bash
npm run ast -- llm/run/polish.mld
```

### 2. Run one iteration (will use real LLM calls!)
```bash
mlld run polish --maxIterations 1
```

### 3. Watch for issues in each phase

**Phase 3a (Apply)** - Check that:
- Worktrees are created: `wt list` should show `polish/*` branches
- Agents can write to QA dir from worktree
- fixed.json contains `worktree_branch` and `commit_sha`

**Phase 3b (Merge)** - Check that:
- Single agent processes all worktrees sequentially
- Merges complete without conflicts (or conflicts are resolved)
- fixed.json updated with `merged: true`

**Phase 3c (Verify)** - Check that:
- `npm test` runs on merged code
- `verification-result.json` written to qa/ dir
- Loop halts if verification fails

### 4. Monitor costs
Each iteration can spawn many Opus calls. Start with `--maxIterations 1`.

---

## Architecture: Polish Flywheel

```
┌────────────────────────────────────────────────────────────────┐
│                    QA POLISH FLYWHEEL                          │
│                                                                │
│   Phase 1          Phase 2          Phase 3a        Phase 3b   │
│  ┌─────────┐     ┌─────────┐     ┌───────────┐   ┌─────────┐  │
│  │Reconcile│────▶│ Analyze │────▶│   Apply   │──▶│  Merge  │  │
│  │ (20//)  │     │ (10//)  │     │  (5// WT) │   │ (seq)   │  │
│  └─────────┘     └─────────┘     └───────────┘   └────┬────┘  │
│                                                        │       │
│                                        Phase 3c        │       │
│                                      ┌─────────┐       │       │
│                                      │ Verify  │◀──────┘       │
│                                      └────┬────┘               │
│                                           │                    │
│                  ┌────────────────────────┘                    │
│                  ▼                                             │
│            ┌──────────┐                                        │
│            │  stable? │──▶ Loop or Exit                        │
│            └──────────┘                                        │
└────────────────────────────────────────────────────────────────┘

Legend:
  (20//) = parallel 20
  (5// WT) = parallel 5 in worktrees
  (seq) = sequential
```

### Phase Details

| Phase | Parallel | Input | Output |
|-------|----------|-------|--------|
| 1. Reconcile | 20 | results.json (fail) | reconciliation.json |
| 2. Analyze | 10 | reconciliation.json (genuine-bug) | proposed-fix.json |
| 3a. Apply | 5 (worktrees) | proposed-fix.json (auto_approve) | fixed.json + worktree |
| 3b. Merge | Sequential | fixed.json (verified) | merged commits |
| 3c. Verify | Single | merged commits | verification-result.json |

### Data Flow

```
results.json (from qa.mld)
    ↓ status == "fail"
reconciliation.json
    ↓ verdict == "genuine-bug" && action == "implement"
proposed-fix.json
    ↓ recommendation.auto_approve == true
fixed.json (in worktree)
    ↓ verified == true && !merged
fixed.json (merged: true)
    ↓
verification-result.json
```

---

## Prompt File Placeholders

| File | Placeholders |
|------|--------------|
| `qa-reconcile-prompt.att` | @topic, @experiment, @status, @summary, @issues, @outputDir |
| `qa-analyze-prompt.att` | @topic, @experiment, @resultsPath, @reconciliationPath, @experimentDir |
| `qa-apply-prompt.att` | @topic, @experiment, @baseBranch, @experimentDir, @rootCause, @rootCauseLocation, @fixId, @confidence, @designFit, @proposedFixes |
| `qa-merge-prompt.att` | @baseBranch, @qaDir, @mergeItems |
| `qa-verify-prompt.att` | @baseBranch, @qaDir, @mergeCount, @iteration, @mergedItems |

---

## Known Issues / TODOs

1. **qa.mld --topic filter broken** - Use `--tier` filter instead
2. **qa-analyze.mld typo** - References `proposed-fixes.json` but should be `proposed-fix.json`
3. **Untested at scale** - Need to run full flywheel and observe behavior
4. **Cost monitoring** - Each iteration spawns many Opus calls

---

## Quick Commands

```bash
# Check polish.mld syntax
npm run ast -- llm/run/polish.mld

# Run single iteration
mlld run polish --maxIterations 1

# Check QA state
find qa/ -name "*.json" -path "*/qa/*" | xargs -I{} basename {} | sort | uniq -c

# List worktrees
wt list

# Clean up polish worktrees (if needed)
wt list | grep polish | awk '{print $1}' | xargs -I{} wt remove {} -y
```
