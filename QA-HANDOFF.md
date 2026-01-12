# QA Polish Flywheel - Session Handoff

## Current State (2026-01-12)

### What's Implemented

The QA polish flywheel is a multi-phase automated system for:
1. Running QA tests against mlld documentation
2. Reconciling failures (doc bug vs code bug)
3. Analyzing genuine bugs and proposing fixes
4. Applying fixes in isolated git worktrees
5. Merging verified fixes back to main branch
6. Running verification tests

### Key Files

| File | Purpose |
|------|---------|
| `llm/run/qa.mld` | Runs QA tests → generates `results.json` |
| `llm/run/polish.mld` | Main flywheel (reconcile → analyze → apply → merge → verify) |
| `llm/run/qa-prompt.att` | QA test prompt template |
| `llm/run/qa-reconcile-prompt.att` | Reconciliation prompt template |
| `llm/run/qa-analyze-prompt.att` | Analysis prompt template |
| `llm/run/qa-apply-prompt.att` | Worktree apply prompt template |
| `llm/run/qa-triage-prompt.att` | Triage failed fixes prompt template |
| `llm/run/qa-merge-prompt.att` | Merge phase prompt template |
| `llm/run/qa-verify-prompt.att` | Verification prompt template |

### Recent Refactoring

Prompts now use the clean `template` pattern instead of `.replace()` chains:

```mlld
# Old way (deleted)
var @promptTemplate = <@base/llm/run/qa-prompt.att>
exe @buildPrompt(tmpl, topic, outputDir) = [
  let @s1 = @tmpl.replace("@topic", @topic)
  => @s1.replace("@outputDir", @outputDir)
]

# New way
exe @buildPrompt(topic, outputDir) = template "./qa-prompt.att"
```

The `template` directive auto-interpolates function parameters into the .att file.

### Deleted Files (redundant with polish.mld)

- `qa-reconcile.mld` - standalone reconciliation
- `qa-analyze.mld` - standalone analysis
- `qa-fixes.mld` - standalone fix application

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    QA POLISH FLYWHEEL                          │
│                                                                │
│   qa.mld              polish.mld                                        │
│  ┌───────┐     ┌──────────────────────────────────────────────────┐    │
│  │  QA   │────▶│ Phase 1    Phase 2    Phase 3a   3a.5  3b    3c  │    │
│  │ Tests │     │ Reconcile → Analyze → Apply → Triage → Merge → Verify │
│  └───────┘     └──────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

### Phase Details

| Phase | Parallel | Input | Output |
|-------|----------|-------|--------|
| QA (qa.mld) | 20 | howto topics | results.json |
| 1. Reconcile | 20 | results.json (fail) | reconciliation.json |
| 2. Analyze | 10 | reconciliation.json (genuine-bug) | proposed-fix.json |
| 3a. Apply | 5 (worktrees) | proposed-fix.json (auto_approve) | fixed.json + worktree commit |
| 3a.5 Triage | Sequential | fixed.json (verified=false) | fixed.json (retry or escalate) |
| 3b. Merge | Sequential | fixed.json (verified) | merged commits |
| 3c. Verify | Single | merged code | verification-result.json |

### Data Flow

```
results.json
    ↓ status == "fail"
reconciliation.json
    ↓ verdict == "genuine-bug" && action == "implement"
proposed-fix.json
    ↓ recommendation.auto_approve == true
fixed.json (worktree_branch, commit_sha)
    ↓ verified == false?
    │   ↓ Triage
    │   → escalated: true (needs human)
    │   → OR retry → verified: true
    ↓ verified == true
fixed.json (merged: true)
    ↓
verification-result.json
```

---

## How to Run

### 1. Generate QA test results (prerequisite)
```bash
mlld run qa --tier 1
```

### 2. Run the polish flywheel
```bash
mlld run polish --maxIterations 1
```

### 3. Check state
```bash
# Count by file type
find qa/ -name "results.json" | wc -l
find qa/ -name "reconciliation.json" | wc -l
find qa/ -name "proposed-fix.json" | wc -l
find qa/ -name "fixed.json" | wc -l

# Check worktrees
wt list
```

---

## Template Placeholders

Each .att file uses `@variable` placeholders that match the exe function parameters:

| Function | Parameters | Template |
|----------|------------|----------|
| `@buildPrompt` | topic, outputDir | qa-prompt.att |
| `@buildReconcilePrompt` | topic, experiment, status, summary, issues, outputDir | qa-reconcile-prompt.att |
| `@buildAnalyzePrompt` | topic, experiment, resultsPath, reconciliationPath, experimentDir | qa-analyze-prompt.att |
| `@buildApplyPrompt` | topic, experiment, baseBranch, experimentDir, rootCause, rootCauseLocation, fixId, confidence, designFit, proposedFixes | qa-apply-prompt.att |
| `@buildTriagePrompt` | topic, experiment, baseBranch, worktreeBranch, experimentDir, errors | qa-triage-prompt.att |
| `@buildMergePrompt` | baseBranch, qaDir, mergeItems | qa-merge-prompt.att |
| `@buildVerifyPrompt` | baseBranch, qaDir, mergeCount, iteration, mergedItems | qa-verify-prompt.att |

---

## What Needs Testing

### Not Yet Tested End-to-End

1. **Phase 3a (Apply in Worktrees)**
   - Does `wt switch --create polish/topic-experiment` work?
   - Does worktree cleanup work when re-running after failure?
   - Can agent write fixed.json to QA dir from inside worktree?
   - Does agent return to base branch after?

2. **Phase 3a.5 (Triage)**
   - Does triage correctly identify retry vs escalate cases?
   - Does retry update fixed.json with verified: true?
   - Does escalate set escalated: true?
   - Is retry_count tracked correctly?

3. **Phase 3b (Merge)**
   - Does `wt merge` work correctly?
   - Are CHANGELOG conflicts handled?
   - Is fixed.json updated with `merged: true`?

4. **Phase 3c (Verify)**
   - Does verification catch broken merges?
   - Is verification-result.json written correctly?
   - Does loop halt on verification failure? ✓ (implemented)

### Spot-Tested (Works)

- Phase logic for finding items needing reconciliation/analysis/apply
- Template interpolation pattern
- AST parsing of polish.mld and qa.mld
- Verification failure halts loop (implemented)

---

## Known Issues

1. **qa.mld `--topic` filter** - Doesn't work correctly, use `--tier` instead
2. **Cost** - Each iteration spawns many Opus calls; start with `--maxIterations 1`

---

## Next Steps for Next Session

1. **Run a real test** of the full flywheel with 1 iteration
2. **Watch Phase 3a/b/c** carefully for worktree issues
3. **Check costs** after a run
4. **Iterate on prompts** based on agent behavior
5. **Consider adding Phase 0** - integrate qa.mld into polish.mld loop

---

## Quick Reference

```bash
# Syntax check
npm run ast -- llm/run/polish.mld
npm run ast -- llm/run/qa.mld

# Run QA tests
mlld run qa --tier 1

# Run polish flywheel
mlld run polish --maxIterations 1

# Check worktrees
wt list

# Clean up polish worktrees
wt list | grep polish | awk '{print $1}' | xargs -I{} wt remove {} -y
```
