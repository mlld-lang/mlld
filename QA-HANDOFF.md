# QA Polish Flywheel - Session Handoff

## Current State (2026-01-12 Late)

**Ready to re-run apply phase.** Cleaned up fixed.json files (removed stale `merged` fields).

```bash
find qa/ -name "fixed.json" -delete
mlld run polish --maxIterations 1
```

### Architecture Refactored

Refactored to use **immutable phase outputs** - each phase writes its own file, later phases never modify earlier phases' data.

### File Structure

```
qa/topic/experiment/
├── results.json        # Phase 0: QA test output
├── reconciliation.json # Phase 1: Bug analysis
├── proposed-fix.json   # Phase 2: Fix design
├── fixed.json          # Phase 3a: Worktree/commit info
├── triage.json         # Phase 3a.5: Retry/escalation (if needed)
├── merged.json         # Phase 3b: Merge confirmation
└── verified.json       # Phase 3c: Post-merge verification
```

### Key Invariants

1. **Each phase writes its own file** - no mutations across phases
2. **File existence = phase complete** - no field checks for cross-phase state
3. **merged.json only after verification** - `git branch --contains` confirms commit landed
4. **Worktrees kept until merged.json exists** - no premature cleanup

---

## Commands

### Run Full Flywheel
```bash
mlld run polish --maxIterations 3
```

### Re-run Apply Phase
```bash
find qa/ -name "fixed.json" -delete
mlld run polish --maxIterations 1
```

### Re-run Merge Phase
```bash
find qa/ -name "merged.json" -delete
mlld run polish --maxIterations 1
```

### Check Status
```bash
echo "fixed.json: $(find qa/ -name 'fixed.json' | wc -l)"
echo "merged.json: $(find qa/ -name 'merged.json' | wc -l)"
echo "verified.json: $(find qa/ -name 'verified.json' | wc -l)"
```

---

## Gotchas

### Must rebuild after grammar/interpreter changes
```bash
npm run build
```
Stale dist causes confusing parse errors like "Invalid /var syntax" even for valid code.

### @claude shows as null but works (mlld-zvhc)
```mlld
import { @claude } from @mlld/claude
show `claude: @claude`  >> prints "null" - misleading!
@claude("prompt", "opus", @base, "Read")  >> actually works
```
Don't debug based on show output - the function works even when it displays as null.

---

## Bugs Fixed This Session

1. **Merge phase field access error** - fixed.json had no `merged` field
   - Root cause: Field didn't exist (not null, absent)
   - Fix: Use file existence (merged.json) instead of field check

2. **Infinite loop** - `let @iteration = @iteration + 1` created local binding
   - Root cause: mlld vars are immutable, `let` creates new scope binding
   - Fix: Use `@mx.loop.iteration` and `continue`/`done` pattern

3. **Optimistic state updates** - fixed.json marked merged before commit confirmed
   - Root cause: JSON updated before git operation verified
   - Fix: Write merged.json only after `git branch --contains` passes

4. **Premature worktree cleanup** - worktrees removed before merge confirmed
   - Fix: Keep worktree until merged.json exists

---

## Key Files

| File | Purpose |
|------|---------|
| `llm/run/polish.mld` | Main flywheel orchestrator |
| `llm/run/qa-apply-prompt.att` | Apply phase → writes fixed.json |
| `llm/run/qa-triage-prompt.att` | Triage phase → writes triage.json |
| `llm/run/qa-merge-prompt.att` | Merge phase → writes merged.json |
| `llm/run/qa-verify-prompt.att` | Verify phase → writes verified.json |

---

## mlld Loop Pattern Reference

```mlld
var @result = loop(@maxIterations) [
  when @input && @input.stable => done @input

  let @iteration = @mx.loop.iteration
  >> ... do work ...

  let @isStable = @workDone == 0
  when @isStable => done { iteration: @iteration, stable: true }
  continue { iteration: @iteration, stable: false }
]

var @final = @result ? @result.iteration : @maxIterations
```
