# QA Polish Flywheel - Session Handoff

## Current State (2026-01-12 Late Night)

### Session Summary

Major breakthrough! Fixed two critical mlld interpreter bugs that were blocking the flywheel. Apply phase now works end-to-end. 28 fixes created in worktrees, all verified. Merge phase has a bug preventing it from finding verified fixes.

### What's Working

1. **Phase 1 (Reconcile)** - Creates reconciliation.json files correctly
2. **Phase 2 (Analyze)** - Creates proposed-fix.json files with auto_approve flags
3. **Phase 3a (Apply)** - NOW WORKING! Creates worktrees, applies fixes, runs tests
4. **Template system** - `exe @fn(params) = template "file.att"` works
5. **Parallel execution** - `for parallel(N, delay)` works correctly

### Current Results

- **28 fixed.json files** created
- **28 worktrees** with commits ready to merge
- **All 28 verified** (tests pass)
- Waiting on merge phase fix

### What's Broken

**Phase 3b (Merge) - Not finding verified fixes** (mlld-8lbq)

The merge phase query returns 0 items even though 28 verified fixes exist:
```
Phase 3b: Merging 0 verified fixes...
```

The filter logic:
```mlld
let @needsMerge = for @f in @freshFixed
  when @f.applied == true
    && @f.verified == true
    && !@f.merged
```

Fixed.json structure:
```json
{
  "applied": true,
  "verified": true,
  "merged": null
}
```

Likely issue: `!@f.merged` with `merged: null` may have edge case behavior.

**Infinite Loop Bug**

After merge phase, the main loop repeats "Iteration 1" endlessly with workDone=0 instead of exiting. Loop counter not advancing properly.

---

## Bugs Fixed This Session

### mlld-nfkj: Glob JSON Parsing (FIXED)
- **Problem**: `<@qaDir/**/file.json>` glob patterns weren't parsing JSON files
- **Symptom**: `@file.topic` returned "Field not found" - file loaded as raw string
- **Root cause**: Glob-loaded files weren't going through JSON parse path
- **Status**: Fixed by other session

### mlld-r2ss: Parallel Serialization (FIXED)
- **Problem**: Nested objects in parallel loops lost properties
- **Symptom**: `let @needsApply = for @f => { fix: @f }` then `@item.fix.topic` failed silently
- **Root cause**: Serialization across parallel boundaries didn't preserve nested glob-loaded objects
- **Status**: Fixed by other session

### mlld-8lbq: Merge Phase Filter (OPEN)
- **Problem**: Merge phase finds 0 verified fixes when 28 exist
- **Symptom**: "Merging 0 verified fixes" after apply phase completes 28
- **Likely cause**: `!@f.merged` with null value edge case
- **Status**: Open, needs investigation

---

## Key Files

| File | Purpose |
|------|---------|
| `llm/run/qa.mld` | Runs QA tests → generates `results.json` |
| `llm/run/polish.mld` | Main flywheel (reconcile → analyze → apply → merge → verify) |
| `llm/run/qa-apply-prompt.att` | Worktree apply prompt template |
| `llm/run/qa-merge-prompt.att` | Merge phase prompt template |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    QA POLISH FLYWHEEL                          │
│                                                                │
│   qa.mld              polish.mld                               │
│  ┌───────┐     ┌──────────────────────────────────────────┐   │
│  │  QA   │────▶│ Phase 1    Phase 2    Phase 3a   3b   3c │   │
│  │ Tests │     │ Reconcile → Analyze → Apply → Merge → Verify │
│  └───────┘     └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘

Current state: ──────────────────────────▲
                                         │
                              28 fixes ready, merge blocked
```

### Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Reconcile | ✓ Working | Creates reconciliation.json |
| 2. Analyze | ✓ Working | Creates proposed-fix.json |
| 3a. Apply | ✓ Working | 28 worktrees created with fixes |
| 3a.5 Triage | ⏸ Untested | No failures to triage |
| 3b. Merge | ✗ Broken | Filter not finding verified fixes |
| 3c. Verify | ⏸ Untested | Blocked by merge |

---

## Zombie Worktrees

Some early runs had broken prompts (before JSON parsing fix) creating worktrees with literal `@item.topic` in branch names:
- `polish/@item.topic-10-H-log-booleans`
- `polish/@item.topic-12-H-complex-when`

These should be cleaned up:
```bash
wt list | grep "@item" | awk '{print $1}' | xargs -I{} wt remove {} -y
```

---

## Next Session Tasks

### 1. Fix Merge Phase (mlld-8lbq)

Debug why `@needsMerge` returns empty:
```mlld
let @needsMerge = for @f in @freshFixed
  when @f.applied == true
    && @f.verified == true
    && !@f.merged
```

Test the filter logic:
```bash
echo 'var @files = <@base/qa/**/fixed.json>
var @verified = for @f in @files when @f.verified == true => @f.topic
show `Found: @verified.length`' > tmp/test-filter.mld && mlld tmp/test-filter.mld
```

### 2. Fix Infinite Loop

The main loop repeats "Iteration 1" endlessly. Check loop counter logic in polish.mld.

### 3. Test Merge Phase

Once filter works, test that merge actually:
- Merges worktree branches to base
- Updates fixed.json with `merged: true`
- Handles CHANGELOG conflicts

### 4. Clean Up Worktrees

After successful merge, verify worktree cleanup.

---

## Proposed Enhancements

### Batch Merging (3 at a time)

Instead of applying all 28 then merging all 28:
```
Apply 3 → Merge 3 → Verify → Apply 3 → Merge 3 → Verify → ...
```

Benefits:
- Easier to review
- Catch issues early
- Less merge conflict risk
- More incremental verification

### Resume Flag

Add `--resume <phase>` to start at specific phase:
```bash
mlld run polish --resume merge    # Skip to merge phase
mlld run polish --resume apply    # Skip reconcile/analyze
```

Useful for debugging specific phases without re-running everything.

---

## Quick Reference

```bash
# Check current state
find qa/ -name "fixed.json" | wc -l          # Should be 28
find qa/ -name "fixed.json" -exec jq -r '.verified' {} \; | grep true | wc -l

# List worktrees
wt list | grep polish

# Clean zombie worktrees
wt list | grep "@item" | awk '{print $1}' | xargs -I{} wt remove {} -y

# Run polish (after fixing merge bug)
mlld run polish --maxIterations 1

# Test filter logic
mlld tmp/test-filter.mld
```

---

## Test Files Created

Debug scripts in `tmp/`:
- `test-glob-json.mld` - Glob JSON parsing test
- `test-parallel-structure.mld` - Parallel with nested objects
- `test-wrapped-glob.mld` - Wrapped glob object access
- `test-polish-pattern.mld` - Full polish.mld pattern test
