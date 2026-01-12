# QA Polish Flywheel - Session Handoff

## Current State (2026-01-12 Evening)

### Session Summary

We've been debugging the polish flywheel to get it working end-to-end. Several issues found and fixed, but one critical blocker remains.

### What's Working

1. **QA Tests** (`mlld run qa --tier 1`) - Generates results.json files correctly
2. **Phase 1 (Reconcile)** - Creates reconciliation.json files
3. **Phase 2 (Analyze)** - Creates proposed-fix.json files with auto_approve flags
4. **Template system** - `exe @fn(params) = template "file.att"` works after escaping fix

### What's Broken (CRITICAL)

**Phase 3a (Apply) - @claude calls not creating sessions**

The apply loop enters, shows debug output for each item, but `@claude()` calls silently fail - no Claude sessions are created. We added debug output:

```
DEBUG: apply loop body for comments/10-H-empty-comments
DEBUG: prompt built, length=4456
DEBUG: calling @claude...
```

But no "Applying:" message appears and no Claude sessions spawn. The `@claude` function (from `@mlld/claude`) uses `claude -p` to invoke Claude Code. Something is preventing the invocation.

**First Run Issue** - In an earlier run, agents DID create sessions but ignored worktree instructions and modified main directly. We committed those fixes (they were good) but need to understand why:
1. That run's @claude calls worked
2. Current run's @claude calls don't work

### Fixes Applied This Session

1. **Template escaping** - Code examples in .att files need `@@` to escape literal `@`
   - Fixed in: qa-analyze-prompt.att, qa-prompt.att

2. **Idempotency checks** - All phase prompts now check for existing work first
   - Agents check if file exists and is valid before redoing work
   - Makes flywheel resumable/restartable

3. **Worktree hard gate** - Apply prompt now has mandatory worktree verification
   - Step 1: Create worktree (MANDATORY)
   - Step 2: Verify branch is `polish/*` before proceeding
   - If worktree fails, write error to fixed.json and exit

4. **Rate limit mitigation** - Added 10s delay between parallel agent spawns
   - Was getting 500 errors from API with many concurrent opus calls
   - `for parallel(N, 10s)` staggers spawns

5. **Committed interpreter fixes** - Agents that ran on main produced valid fixes:
   - Environment.ts: let binding scope fix
   - exec-invocation.ts: effects attachment ordering
   - executor.ts: pre-effects support
   - var.ts: conditionalPair handling
   - unified-processor.ts: Variable resolution ordering

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

### BLOCKED - @claude invocation broken

Cannot test phases 3a-3c until we fix the @claude silent failure issue.

### Not Yet Tested End-to-End

1. **Phase 3a (Apply in Worktrees)** - BLOCKED
   - Does `wt switch --create polish/topic-experiment` work?
   - Does worktree cleanup work when re-running after failure?
   - Can agent write fixed.json to QA dir from inside worktree?
   - Does agent return to base branch after?
   - Note: We added worktree verification step - agents must confirm branch before proceeding

2. **Phase 3a.5 (Triage)** - BLOCKED
   - Does triage correctly identify retry vs escalate cases?
   - Does retry update fixed.json with verified: true?
   - Does escalate set escalated: true?
   - Is retry_count tracked correctly?

3. **Phase 3b (Merge)** - BLOCKED
   - Does `wt merge` work correctly?
   - Are CHANGELOG conflicts handled?
   - Is fixed.json updated with `merged: true`?

4. **Phase 3c (Verify)** - BLOCKED
   - Does verification catch broken merges?
   - Is verification-result.json written correctly?
   - Does loop halt on verification failure? ✓ (implemented)

### Tested and Working

- Phase 1 (Reconcile) - Creates reconciliation.json correctly
- Phase 2 (Analyze) - Creates proposed-fix.json with auto_approve flags
- Template interpolation pattern with `@@` escaping
- Phase logic for finding items needing work
- AST parsing of polish.mld and qa.mld
- Verification failure halts loop
- Idempotency checks in prompts

---

## Known Issues

1. **@claude calls silently failing in apply phase** - CRITICAL BLOCKER
   - Loop body executes, template builds, but @claude() doesn't spawn sessions
   - Need to debug why @mlld/claude module's `claude -p` invocation fails
   - Check: Is the prompt too long? Is there a permission issue?

2. **Agents ignored worktree instructions** - Fixed with hard gate, but why did they ignore?
   - Now have mandatory verification step before proceeding

3. **API rate limits** - 500 errors when spawning many opus calls
   - Mitigated with 10s delay between spawns
   - May need longer delay or lower concurrency

4. **qa.mld `--topic` filter** - Doesn't work correctly, use `--tier` instead

5. **Cost** - Each iteration spawns many Opus calls; start with `--maxIterations 1`

---

## Next Steps for Next Session

### Immediate (Debug @claude failure)

1. **Test @claude directly** - Does a simple `@claude("hello", "opus", @base, "Read")` work?
   ```bash
   echo 'import { @claude } from @mlld/claude
   var @r = @claude("Say hello", "opus", @base, "Read")
   show @r' > tmp/test-claude.mld && mlld tmp/test-claude.mld
   ```

2. **Check @mlld/claude module** - The module uses `claude -p` with `--allowedTools`
   - Verify `claude -p --model opus --allowedTools "Read"` works from shell
   - Check if there's a session/permissions issue

3. **Add more logging** - Consider adding `| log` to intermediate steps to trace failure point

### After @claude Works

1. **Test full apply phase** - One item through worktree creation → code change → test → commit
2. **Verify worktree isolation** - Confirm changes happen in worktree, not main
3. **Test merge phase** - Merge a verified worktree back to main
4. **Test verification phase** - Run build+test after merge

### Future Improvements (Discussed but not implemented)

1. **Haiku pre-filter** - Use haiku to validate existing analysis before spawning opus
   - Cheaper/faster to check "is this analysis valid?" with haiku
   - Only spawn opus if haiku says invalid
   - Add complexity score (0-1) to prioritize human review

2. **BLOCKED output** - Agents should output `BLOCKED: message` when hitting barriers
   - Surface blockers to command-line for visibility

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
