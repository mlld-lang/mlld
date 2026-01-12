# QA Infrastructure - Session Handoff

## Session Progress (2026-01-11)

### Completed

1. **P0 Fix (mlld-d49g)** - Commit `fa775ade2`
   - Added `if (!context?.isExpression)` check around CodeFence emission
   - Fixed in both locations: `interpreter/core/interpreter.ts` lines 287-301 and 382-396
   - **Direct execution works correctly** - `mlld script.mld` no longer outputs documentation garbage
   - Bead closed

2. **Created `llm/run/qa-analyze.mld`** + `llm/run/qa-analyze-prompt.att`
   - Finds failed experiments without `proposed-fixes.json`
   - Spawns parallel Claude agents to analyze failures
   - Uses `sh { node -e "..." }` pattern for filesystem operations (mlld JS is sandboxed)

3. **Created `llm/run/qa-fixes.mld`** + `llm/run/qa-fixes-prompt.att`
   - Finds experiments with `decision` set but not `fixed`
   - Supports `--dryrun` flag
   - Runs fixes sequentially to avoid git conflicts

### Fixed: `mlld run` CodeFence Bug

**Commit `85005455b`** - Extended `isExpression` check to all content emission paths.

**Root Cause:** The original CodeFence fix only covered one code path. Text nodes (markdown content between code fences), Newline nodes, and the single-node CodeFence evaluation path were all missing the `isExpression` check.

**Fix:** Added `if (!context?.isExpression)` check to:
- Text node emission (lines 254-278, 351-375)
- Newline node emission (lines 282-291, 378-387)
- Single-node CodeFence evaluation (lines 495-506)
- Document child Text nodes (line 883)

---

## Remaining Work

### Test QA Pipeline Scripts

1. [ ] Test `mlld run qa-analyze --limit 3` on a few failures
2. [ ] Verify `proposed-fixes.json` output format
3. [ ] Test `mlld run qa-fixes --dryrun`
4. [ ] Run a full fix cycle on one experiment

### Run Full QA

1. [ ] Run `mlld run qa --tier 1` (may need longer timeout)
2. [ ] Review results and compare to previous run

---

## QA Results Summary (from first run)

| Metric | Count |
|--------|-------|
| Total experiments | 210 |
| Pass | 163 (78%) |
| Fail | 26 (12%) |
| Partial | 21 (10%) |
| Issues found | 104 |

**Issue categories**: broken-promise (31), friction (31), unclear-docs (26), unclear-error (10), enhancement (6)

**Topics with failures**: escaping-basics (4), foreach (3), comments (2), exe-simple (2), for-block (2), run-params (2), output (2), file-loading-basics (2)

---

## Analysis/Fix Pipeline Design

### `qa-analyze.mld`

Finds failed experiments and spawns analysis agents.

**Usage:**
```bash
mlld run qa-analyze [--topic <filter>] [--limit <n>]
```

**Output:** `qa/{topic}/{experiment}/proposed-fixes.json`

```json
{
  "experiment": "01-L-basic-usage",
  "topic": "escaping-basics",
  "analysis": {
    "root_cause": "Description of why this fails",
    "root_cause_confidence": 0.85,
    "complexity": 0.3,
    "files_involved": ["grammar/...", "interpreter/..."],
    "requires_investigation": false
  },
  "proposed_fixes": [
    {
      "id": "fix-1",
      "description": "Update grammar rule X",
      "approach": "Detailed implementation steps",
      "tradeoffs": "Potential side effects",
      "confidence": 0.9,
      "effort": "low|medium|high"
    }
  ],
  "decision": "fix-1",
  "decision_reason": null
}
```

### `qa-fixes.mld`

Applies fixes based on `proposed-fixes.json`.

**Usage:**
```bash
mlld run qa-fixes [--topic <filter>] [--limit <n>] [--dryrun]
```

---

## Related Beads

| Bead | P | Issue |
|------|---|-------|
| ~~mlld-d49g~~ | ~~P0~~ | ~~CodeFence emitted during module import~~ (FIXED - commits fa775ade2, 85005455b) |
| mlld-cpuu | P1 | .mx.fm doesn't work on for-loop iteration variables |
| mlld-x0dg | P2 | Standardize on .mx namespace for metadata |
| mlld-r5cq | P2 | `!` negation in for-when conditions |
| mlld-0tpg | P2 | Empty `[]` in when-first actions |
| mlld-nkv6 | P2 | Destructured @payload import fails |
| mlld-ezuw | P2 | Ternary in let assignments in exe blocks |
| mlld-ghie | P2 | template directive executes code blocks |
| mlld-ncyj | P3 | No toString() method |

---

## Key Files

| File | Purpose |
|------|---------|
| `llm/run/qa.mld` | QA orchestration - spawns test agents |
| `llm/run/qa-analyze.mld` | Analysis pipeline (NEW) |
| `llm/run/qa-fixes.mld` | Fix pipeline (NEW) |
| `interpreter/core/interpreter.ts` | CodeFence fix location |
| `cli/commands/run.ts` | `mlld run` command - uses SDK execute |
| `sdk/execute.ts` | SDK execute wrapper |
| `interpreter/index.ts` | interpret() and output building |
