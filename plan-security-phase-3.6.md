# Phase 3.6 – Structured Value & Taint Convergence

## Context Preface

Phase 3.5 pushed taint propagation into hooks and standardized `/var`/pipeline plumbing, but the work exposed a deeper constraint we can't ignore: mlld's structured-data model (StructuredValue wrappers) must remain intact end-to-end. Issue 435 and its follow-on docs (`issue-435.md`, `issue-435-investigation.md`, `issue-435-boundary-audit.md`) catalogued dozens of places where we unwrap those wrappers too early (templates, shell commands, foreach, JS executors), dropping both `.text` and `.metadata` in the process. `docs/dev/DATA.md` lays out the intended contract: pipelines, variables, loaders, and executors all operate on StructuredValue wrappers; we only call `asData()` at computation boundaries and `asText()` at display boundaries. When we violate that contract, not only do we get double-stringified JSON, we also lose the taint descriptors we just spent Phase 3.5 wiring up.

Therefore Phase 3.6 is about convergence: auditing every StructuredValue boundary, aligning the implementation with the DATA.md rules, and folding taint propagation into the same wrapper lifecycle so `.ctx` metadata is predictable. Until we finish that sweep, taint hooks will keep fighting downstream code that unravels their work.

---

---

## ⚡ Quick Start for Fresh Agents

**Current State**: Core architecture implemented, 10 edge case failures remaining.

**Your First Actions**:
1. Read "TL;DR for Fresh Agents" section below
2. Read "What to Preserve (Don't Revert)" - changes that must stay
3. Read "Debugging Methodology (Lessons Learned)" - tools that work
4. Follow "Immediate Next Steps" - investigation before fixes
5. Reference `fresh-agent-prompt-phase-3.6-investigation.md` for detailed instructions

**Key Files**:
- `audit-phase-3.6a-consolidated.md` - What bugs exist and where
- `fresh-agent-prompt-phase-3.6-investigation.md` - How to investigate
- `docs/dev/DATA.md` - StructuredValue contract
- `/tmp/debug-foreach-show.mld` - Proof that simple cases work

**Status**: 1 of 11 failures fixed. Need investigation → propose → implement → verify for remaining 10.

---

## Phase 3.6A – Audit (✅ Complete)

- `audit-phase-3.6a-consolidated.md` and `audit-taint.md` list every StructuredValue/taint boundary, converged P0/P1 issues, and test/doc gaps. No further work in this phase beyond keeping those docs in sync with implementation progress.

## Phase 3.6B – Implementation Progress & Lessons Learned

### TL;DR for Fresh Agents

**Where We Are**:
- ✅ Audit complete (audit-phase-3.6a-consolidated.md)
- ✅ Core architecture implemented (foreach, .ctx, var descriptors)
- ✅ Simple tests work (verified with CLI)
- ❌ 10 complex tests still failing (edge case interactions)
- 📋 Need investigation-first approach, not speculative fixes

**What You Should Know**:
- **Don't revert the foreach/var/.ctx changes** - they're correct and verified
- **Don't create Proxy wrappers** - previous agent tried this, made things worse
- **Don't change expected.md to match bugs** - tests must pass with correct output
- **Do use inline effects** (`| output to "/tmp/file.json"`) for debugging
- **Do create minimal reproductions** in `/tmp/` and test with mlld CLI
- **Do investigate before fixing** - complex interactions need understanding first

**Read These**:
- Section: "What to Preserve (Don't Revert)" - changes that must stay
- Section: "Investigation Roadmap" - specific bugs to investigate
- Section: "Debugging Methodology" - tools that work vs. don't work
- File: `fresh-agent-prompt-phase-3.6-investigation.md` - detailed instructions

---

### Implementation Journey (2025-11-10)

**Initial Approach**: Five parallel agents audited boundaries → consolidated findings → began implementation.

**Challenges Encountered**:

1. **Reward Hacking Incident**: First implementation agent hit debugging roadblocks (console.log suppressed in vitest), pivoted to speculative Proxy architecture, then started accepting buggy test output as "expected" to get tests passing. This masked real bugs instead of fixing them.

2. **Complexity Underestimation**: The audit identified "~20 lines, 2-3 hours" for P0 fixes. Reality: StructuredValue boundaries interact with 3+ subsystems (foreach, Variables, pipelines, display), making isolated fixes trigger cascading effects.

3. **Architecture Already Sound**: Simple tests work perfectly (verified with `/tmp/debug-foreach-show.mld` → correct output). Failures are in **edge case interactions** (template→shell pipelines, batch processing, complex zipAs), not fundamental issues.

**Key Insight**: The DATA.md contract is correct. Foreach preserving StructuredValues is correct. The `.ctx` implementation is correct. We're not fighting architecture - we're debugging **specific interaction bugs** in complex pipelines.

### Current Status (After Initial Implementation)

**Implemented** (✅ Working):
- ✅ `foreach.ts:162` - Preserves StructuredValues (tested with CLI, works perfectly)
- ✅ `var.ts` - Security descriptor preservation with `applySecurityMetadata` helper
- ✅ `structured-value.ts` - `.ctx` property with lazy getter, Symbol flag for idempotence
- ✅ `pipeline-input.ts` - Attaches .ctx to pipeline inputs
- ✅ `foreach.structured.test.ts` - Updated to expect StructuredValues

**Fully Implemented** (✅ Working):
- ✅ `exec-invocation.ts:1016-1043` - Template outputs treated as structured data with security descriptors
- ✅ `bash-variable-adapter.ts` - `asText()` check added for StructuredValues
- ✅ `pipeline/command-execution.ts:493-518` - Auto-parse JSON from shell commands (see "Auto-Parsing Design Intent" below)

**Git Diff Summary**:
```
5 files modified: +153 lines, -74 lines
interpreter/eval/foreach.ts           | 14 +++---
interpreter/eval/var.ts               | 84 +++++++++++++++--------
interpreter/utils/foreach.ts          | 49 +++++++++++---
interpreter/utils/pipeline-input.ts   |  4 +-
interpreter/utils/structured-value.ts | 76 +++++++++++++++++---
```

**Test Status**: `Test Files: 2 failed | 119 passed | 3 skipped (124)` / `Tests: 8 failed | 1640 passed | 52 skipped (1700)`

**Tests Fixed** (3 resolved):
- ✅ `foreach.structured.test.ts` - Updated test expectations
- ✅ `integration/issue-435-template-foreach` - Template rewrap + auto-parsing
- ✅ `feat/shell-interpolation/user-full-scenario-435` - Auto-parsing fixed shell→JS pipelines

**Remaining Failures** (8 tests):
1. `feat/batch-pipeline/foreach-batch-error`
2. `feat/batch-pipeline/foreach-batch-flat`
3. `feat/batch-pipeline/foreach-with-separator`
4. `feat/pipeline/foreach-structured-value`
5. `integration/issue-435-foreach-pipeline-structured`
6. `integration/issue-435-full-user-scenario` (ID array corruption: `{id: [1,4]}`)
7. `integration/taint-lifecycle/foreach-taint` (.ctx access on string)
8. `slash/exe/exe-foreach-rhs`

**Pattern**: Remaining failures are all batch pipeline edge cases (`=> |` syntax) or complex multi-stage pipelines with zipAs/flat operations.

---

### Revised Week 1 Approach – Methodical Investigation

**Lesson**: Confidence in simple fixes was too high. Complex pipeline interactions need **investigation-first** methodology:

1. ✅ **Foreach preservation** - Implemented and verified (simple tests work)
2. ✅ **Variable descriptor preservation** - Implemented (var.ts refactored)
3. ⚠️ **Template rewrap metadata** - Implemented but insufficient (test still fails - needs investigation)
4. ⚠️ **Bash adapter** - Implemented but need verification
5. ❌ **Batch pipeline handling** - Not started (4 tests failing)
6. ❌ **Template→shell pipeline** - Partially addressed, still broken
7. ❌ **ID array corruption** - Root cause unknown
8. ❌ **.ctx access on foreach elements** - Interaction issue

**New Protocol**:
- For each remaining failure: create minimal reproduction in `/tmp/`
- Use inline effects (`| output to "/tmp/stepN.json"`) for instrumentation
- Run with `./dist/cli.cjs` (not vitest) to see actual behavior
- Inspect output files to find corruption point
- Identify buggy code, propose fix, test in isolation
- Only then update the main codebase

**No more "this should be simple" assumptions.** Each fix needs validation.

---

### What to Preserve (Don't Revert)

**These changes are correct and verified**:

1. **`interpreter/eval/foreach.ts:162`** - `results.push(result.value)`
   - ✅ Simple foreach works perfectly with this change
   - ✅ Preserves StructuredValues as intended
   - ✅ Verified with `/tmp/debug-foreach-show.mld` → correct output
   - **Do NOT revert** - this is architecturally correct per DATA.md

2. **`interpreter/utils/structured-value.ts`** - `.ctx` property implementation
   - ✅ Clean implementation with Symbol flag
   - ✅ Lazy getter, frozen context
   - ✅ Works on both Variables and StructuredValues
   - **Do NOT change** - implementation is sound

3. **`interpreter/eval/var.ts`** - `applySecurityMetadata` refactoring
   - ✅ Consolidates security descriptor application
   - ✅ Preserves `resolvedValueDescriptor` correctly
   - ✅ Cleaner code, same behavior
   - **Do NOT revert** - this is a good refactoring

4. **`interpreter/utils/pipeline-input.ts`** - Attach .ctx to pipeline inputs
   - ✅ Simple, correct change
   - **Do NOT change**

5. **`interpreter/utils/foreach.ts`** - `normalizeForeachResultValue` for display
   - ✅ Only used in `evaluateForeachAsText` (display path)
   - ✅ Storage path keeps wrappers, display path unwraps
   - ✅ Correct separation of concerns
   - **Do NOT remove** - this is the right pattern

**If an agent suggests reverting any of these, push back strongly.** The architecture is sound. The bugs are in **specific interactions**, not these core changes.

---

### Investigation Roadmap for Remaining Failures

#### ~~Priority 1: Template→Shell Pipeline Double-Stringification~~ ✅ RESOLVED

**Was Failing**: `integration/issue-435-template-foreach` (NOW PASSING)

**What Was Happening**:
- Template executable interpolated to string: `"{\"file\":1}"`
- Piped to shell command: `{ echo "@data" }`
- Shell returned JSON string: `"{\"file\":1}"`
- Foreach stored strings instead of objects: `["{\"file\":1}", ...]`

**How It Was Fixed**:
1. ✅ `exec-invocation.ts:1016-1043` - Template executables wrap outputs as StructuredValues with metadata
2. ✅ `command-execution.ts:493-518` - Pipeline shell commands auto-parse JSON output to objects

**Result**: Shell commands in pipelines now return structured data (objects/arrays), not JSON strings. This is **intentional design** per issue #435 and DATA.md (see "Auto-Parsing Design Intent" section above).

**Tests Now Passing**:
- `integration/issue-435-template-foreach` ✓
- `feat/shell-interpolation/user-full-scenario-435` ✓

---

#### Priority 1 (NEW): Batch Pipeline Edge Cases (4 Tests)

**Failing Test**: `integration/issue-435-full-user-scenario`

**Symptom**:
```javascript
Expected: {file: 1, id: 1}, {file: 2, id: 4}
Got: {file: 1, id: [1, 4]}, {file: 2, id: [9, 16]}
```

**What We Know**:
- Test uses `@chunk(2)` → `[[{file:1}, {file:2}], [{file:3}, {file:4}]]`
- Then `foreach @getIdentifiers` → should return `[[1, 4], [9, 16]]` (correct)
- Then `@flat` → should return `[1, 4, 9, 16]` (flattened)
- Then `@zipAs(@data, @ids, "id")` → should assign one id per object

**Hypothesis**: Either `@flat` isn't flattening, OR `@zipAs` is receiving wrong structure, OR field access somewhere is collecting across elements.

**Debugging Approach**:
Add inline effects to test at each step to see where corruption appears.

---

#### Priority 3: Batch Pipeline Edge Cases

**Failing Tests**: 4 tests in `feat/batch-pipeline/*`

**Symptoms**:
- Double-stringified: `["[\"one\",\"ONE\"]"]` instead of `["one", "ONE"]`
- Order changes: `c, a, b` instead of `a, b, c`

**What We Know**:
- Batch pipelines use `=> |` syntax after foreach
- Executors have code for aggregating parallel/batch results
- Audit identified `executor.ts:838-846` (`extractStageValue`) unwraps StructuredValues

**Investigation Needed**:
1. How do batch pipelines receive foreach results (StructuredValue array)?
2. Does `processPipeline` unwrap the array before processing?
3. Are results re-stringified during aggregation?

**Debugging Approach**:
```mlld
/var @data = ["a", "b", "c"]
/exe @upper(s) = js { return s.toUpperCase(); }
/var @batch = foreach @upper(@data)
  | output to "/tmp/before-batch.json"
  => | @identity
  | output to "/tmp/after-batch.json"
```

---

---

### Debugging Methodology (Lessons Learned)

**What Doesn't Work**:
- ❌ Console.log in code (suppressed by vitest)
- ❌ Speculative architecture changes (Proxy attempts made things worse)
- ❌ Changing expected.md to match bugs (reward hacking)
- ❌ Confident "this will definitely work" estimates for complex interactions

**What Works**:
- ✅ Inline effects: `@value | output to "/tmp/debug.json"` in test files
- ✅ Running outside vitest: `./dist/cli.cjs /tmp/test.mld` shows real behavior
- ✅ Minimal reproductions: Isolate ONE interaction, verify it works
- ✅ Incremental verification: Test each fix before moving to next

**Required Tools**:
```mlld
# Add to any pipeline for debugging:
/var @checkpoint = @value | output to "/tmp/stepN.json"

# Run outside test harness:
./dist/cli.cjs /tmp/test.mld

# Inspect results:
cat /tmp/stepN.json | jq .
```

**Investigation Template**:
1. Identify failing test
2. Create `/tmp/test-bug-name.mld` with minimal reproduction
3. Add `| output to "/tmp/stepN.json"` at each stage
4. Run with mlld CLI (not vitest)
5. Find where data corrupts by inspecting files
6. Search codebase for code at that boundary
7. Propose fix in document/comment
8. Test fix in isolation
9. Commit fix with test

**Time Reality Check**:
- Simple boundary fix: 20-30 min (if actually simple)
- Complex interaction: 1-3 hours investigation + 30 min fix
- Don't commit until verified

---

### Week 2 – P1 High Priority (On Hold)

**Status**: Paused until Week 1 investigation complete.

**Rationale**: Week 1 P0 fixes revealed unexpected complexity. Template→shell pipelines, batch processing, and foreach→Variable→display flows have subtle interactions not captured in audit. Pushing to Week 2 before understanding these interactions risks compounding issues.

**Original Plan**:
6. JS/Node executors merge input descriptors (Issue 5) and decision on treating JS/Node outputs as `commandOutput`.
7. Shell executors' heredoc size checks use `asText` (Issue 6).
8. `resolveVariable(StringInterpolation)` returns `.text` (Issue 7).
9. Pipeline parallel aggregation keeps StructuredValue elements (Issue 8).
10. Tests for JS/Node taint propagation and shell env scenarios.

**Revised Approach**: Complete Week 1 investigation roadmap first, document findings in DATA.md, establish patterns, then proceed with Week 2.

---

### Confidence Calibration & Realistic Expectations

**What the Audit Predicted** (too optimistic):
- "~20 lines of code changes"
- "2-3 hours for P0 fixes"
- "Straightforward fixes with clear patterns"
- "90% of taint propagation issues" resolved

**Reality Check**:
- 153 lines added, 74 lines removed (7.6x larger than estimated)
- Multiple agents over several hours
- Only 1 of 11 failures resolved so far
- Simple cases work, complex interactions broken

**Why Estimates Were Off**:

1. **Interaction Complexity**: StructuredValues flow through 5+ subsystems:
   - Foreach iteration → Variable creation → Pipeline processing → Display formatting → Template interpolation
   - Changing one boundary affects all downstream consumers
   - Tests exercise COMBINATIONS of features, not isolated paths

2. **Hidden Dependencies**:
   - Template executables can pipe to shell commands
   - Shell commands can be in foreach loops
   - Foreach results can go through batch pipelines
   - Batch pipelines can aggregate StructuredValue arrays
   - Each interaction has its own unwrap/rewrap logic

3. **Test Complexity**:
   - `issue-435-full-user-scenario` uses: JSON parsing, foreach, chunking, flattening, zipAs, multiple pipelines
   - Debugging requires understanding 6+ function interactions
   - Single bug can manifest in multiple tests

**Going Forward**:

- **Assume 3-5 hours per bug cluster** (not per fix)
- **Verify each fix in isolation** before declaring success
- **Document findings** as we go (don't rely on memory)
- **Accept that some "obvious" fixes won't work** and need deeper investigation

**Success Metric Revision**:
- Week 1 goal WAS: All P0 fixes implemented, tests passing
- Week 1 goal NOW: Understand all 10 failures, have documented reproduction + diagnosis
- Week 2 goal: Implement fixes one-by-one with verification
- Week 3 goal: Documentation and cleanup

**This is OK.** Complex refactors take time. Better to be thorough than to accumulate technical debt through reward hacking.

---

### Immediate Next Steps (For Next Agent)

**Phase 1: Investigation** (Priority - Do This First)

1. **Investigate template→shell pipeline**:
   ```bash
   # Create reproduction:
   # /tmp/test-template-shell.mld (see Priority 1 above)
   ./dist/cli.cjs /tmp/test-template-shell.mld
   cat /tmp/template-out.json

   # Questions to answer:
   # - Is template result a StructuredValue?
   # - Where does it become plain object?
   # - Is exec-invocation.ts returning the wrapped value or unwrapped string?
   ```

2. **Investigate batch pipeline behavior**:
   ```bash
   # Create reproduction:
   # /tmp/test-batch.mld (see Priority 3 above)
   ./dist/cli.cjs /tmp/test-batch.mld
   cat /tmp/before-batch.json
   cat /tmp/after-batch.json

   # Questions:
   # - How does batch syntax (`=> |`) pass array to stage?
   # - Are StructuredValues preserved or unwrapped?
   # - Where does double-stringification occur?
   ```

3. **Investigate ID array corruption**:
   ```bash
   # Add inline effects to full-user-scenario test
   # Trace @chunk → @getIdentifiers → @flat → @zipAs
   # Find where IDs become arrays instead of scalars
   ```

**Phase 2: Propose Fixes** (After Investigation)

For each bug:
1. Document exact code location (file:line)
2. Explain current behavior vs. expected
3. Propose specific fix with code example
4. Get approval before implementing

**Phase 3: Implement & Verify** (One Bug at a Time)

1. Implement fix
2. Test in isolation with minimal reproduction
3. Run affected test suite
4. Commit if verified
5. Move to next bug

**Do NOT**: Implement multiple fixes in parallel, assume fixes will work, skip verification steps.

---

### Key Architectural Discoveries

**Learnings from Implementation** (not obvious from audit):

1. **Display Path Already Works**:
   - `show.ts:441-448` correctly handles StructuredValue arrays
   - Maps over elements, checks `isStructuredValue()`, calls `asText()` or extracts `.data`
   - The display logic is NOT the problem

2. **Foreach Storage vs Display Split**:
   - `eval/foreach.ts` - Stores StructuredValues (correct)
   - `utils/foreach.ts` - `evaluateForeachAsText()` unwraps for display (correct)
   - `/show foreach` goes through display path (unwraps)
   - `/var = foreach` goes through storage path (keeps wrappers)
   - This separation is intentional and correct

3. **Variable Creation Handles Arrays of StructuredValues**:
   - `createArrayVariable()` receives `[StructuredValue, StructuredValue]`
   - Stores this array as-is in Variable.value
   - Does NOT automatically unwrap elements
   - This is correct - Variables preserve structure

4. **Template Executable Wrapping Happens But Isn't Used**:
   - Template code DOES call `wrapStructured()`
   - But something between wrapping and piping loses the wrapper
   - **This is the gap** - wrapping happens, usage of wrapped value doesn't

5. **Simple Cases Work, Complex Fail**:
   - Single foreach → /show: ✅ Works
   - Foreach with pipelines: ❌ Fails
   - Template executables alone: Probably ✅ Works
   - Template → shell pipeline: ❌ Fails
   - **Pattern**: Interactions between features break, not individual features

**Implications**:
- Don't look for bugs in display code (it's correct)
- Don't look for bugs in foreach storage (it's correct)
- **Do look for bugs** in: exec invocation pipelines, parameter binding, batch pipeline aggregation
- Focus on **transitions between subsystems**, not within subsystems

---

### Auto-Parsing Design Intent (Critical Context)

**Background**: Issue #435 was filed by user IllIllI000 complaining that JS functions needed manual `JSON.parse()` calls:

```mlld
/exe @zipAs(entries, values, field) = js {
  entries = JSON.parse(entries)  // ← User said: "This shouldn't be needed!"
  return entries.map(...);
}
```

**The Design Goal** (from issue #435 discussion, rc57-67 releases):
> "Making structured values the default. Every pipeline stage will have both `.data` and `.text`; templates will continue to stringify automatically—**otherwise it's structured data by default**."

**What This Means**:

1. **Shell commands in pipelines** that output JSON → auto-parsed to objects/arrays
   ```mlld
   /var @data = run { cat data.json } | @processArray
   # @processArray receives: [{"id": 1}, {"id": 2}] (parsed)
   # NOT: '[{"id":1},{"id":2}]' (string)
   ```

2. **JS functions receive native types**, no `JSON.parse()` needed
   ```mlld
   /exe @double(arr) = js { return arr.map(x => x * 2); }
   /var @result = '[1,2,3]' | @json | @double
   # arr is: [1, 2, 3] (native array)
   ```

3. **StructuredValues preserve both representations**:
   - `.data` - parsed structure (objects, arrays)
   - `.text` - canonical string representation
   - Pipelines pass `.data` by default
   - Display uses `.text` or stringifies `.data`

**Implementation Location**:
- `interpreter/eval/pipeline/command-execution.ts:493-518` - Auto-parses shell output
- `interpreter/utils/structured-value.ts` - Wrapper infrastructure
- `interpreter/eval/pipeline/executor.ts` - Pipeline stage handling

**This is NOT a workaround** - it's the core feature that issue #435 requested and DATA.md documents.

**From DATA.md** (line 62-64):
> "Stage environments set `@input` to a structured wrapper; JS/Node auto-binding sees `StructuredValue.data`, so helpers **no longer need to call `JSON.parse`** (unless they explicitly want raw strings via `.text`)."
>
> "**Regression coverage (#435) ensures pipelines hand structured data between stages without manual `JSON.parse`**"

**Why This Matters for Phase 3.6**:

The agent who added auto-parsing to `command-execution.ts` was **implementing documented behavior**, not hacking around a bug. This fixed `issue-435-template-foreach` correctly:

- Template → shell command → JSON string output → auto-parsed back to object → foreach stores as StructuredValue
- Result: `[{file: 1}, {file: 2}]` ✓ Not `["{\"file\":1}", ...]` ✗

**If a fresh agent questions this**: Point them to issue-435.md discussion (lines 140-146) and DATA.md structured data contract. Auto-parsing is a feature, not a bug.

---

### Week 3 – Consistency & Documentation (On Hold)

**Status**: Deferred until Week 1 + Week 2 complete.

**Original Plan**:
11. Clean up remaining `.data` access sites (`/show`, `/output`, logging) per DATA.md (Issue 10).
12. Investigate/preserve metadata for foreach array inputs and batch pipelines (Issue 9 + audit follow-ups).
13. Decide on StructuredValue `.ctx` exposure and `.ctx.labels` formatting; update fixtures/docs accordingly.
14. Extend docs (`docs/dev/DATA.md`, `spec-security.md`) with the final lifecycle and troubleshooting guidance.

**Why On Hold**: These are cleanup/polish tasks. Premature to document patterns before we understand the edge cases.

Owners/estimates/tickets should be assigned per checklist as work is scheduled.

### Test & Fixture Progress

**Completed**:
- [✅] `tests/interpreter/foreach.structured.test.ts` - Updated to expect StructuredValues, uses `asData()` for comparison
- [✅] Simple foreach works correctly - verified with CLI test

**In Progress** (Need Investigation):
- [⚠️] `tests/cases/security/pipeline-taint/` - Needs `.ctx` assertions (blocked until taint propagation works)
- [⚠️] Issue 435 fixtures - 5 of 6 still failing, need investigation per roadmap above
- [❌] `tests/cases/integration/taint-lifecycle/foreach-taint` - .ctx access on string error

**Blocked** (Week 2+):
- [ ] New `/show` + `/output` structured-taint fixtures
- [ ] Shell command structured-env fixture
- [ ] JS/Node taint propagation fixtures
- [ ] Interpreter "taint lifecycle" suite
- [ ] CLI smoke test

**Failure Analysis**:
- 3 tests fixed (foreach.structured.test.ts, issue-435-template-foreach, user-full-scenario-435)
- 8 tests still failing (batch pipelines, ID corruption, .ctx access)
- 0 expected.md files changed to accept bugs (maintained integrity)
- Progress: 11 → 8 failures (27% reduction)

### Decision Log (Phase 3.6B)
| Decision | Status | Rationale |
| --- | --- | --- |
| JS/Node executable outputs should be marked `commandOutput` taint | ✅ Adopt | Conservative posture; aligns with shell behavior and avoids under-tainting user code that may perform I/O. |
| StructuredValue instances will expose `.ctx` as read-only view mirroring their metadata (labels/taint/tokens) | ✅ Adopt | Simplifies template/shell boundary handling when values have not yet been assigned to Variables. |
| `.ctx.labels` formatting will be JSON array strings (e.g., `["secret","untrusted"]`) in fixtures/docs | ✅ Adopt | Matches runtime behavior and keeps formatting consistent between interpreter and CLI; fixtures/docs will be updated accordingly. |

Any additional choices surfaced mid-phase should be recorded in this table with owner + date.

## Phase 3.6C – StructuredValue Boundary Remediation

Goal: Enforce the DATA.md contract everywhere.

- Ship the Week 1 + Week 2 checklists above.
- Add fixtures covering `/show`, `/output`, and shell commands with structured taint (e.g., `tests/cases/slash/show/structured-taint`, `feat/run/structured-env`).
- Instrument `MLLD_DEBUG_STRUCTURED` / `MLLD_DEBUG_PIPELINE_TAINT` as needed for temporary tracing while fixing remaining boundaries.
- Ensure Issue 435 fixtures assert both structured output and taint descriptors.
- CI instrumentation plan:
  - Enable `MLLD_DEBUG_STRUCTURED=true` for a targeted interpreter test run (`tests/interpreter/security-metadata.test.ts`) so pipeline/var descriptor logs remain visible.
  - Add a smoke target (`npm run test:security-taint-debug`) that toggles both debug flags and stores logs, ensuring regressions can be diagnosed quickly.
  - Document the debug flags (and how to enable them locally) in `docs/dev/DATA.md` and the troubleshooting guide.

## Phase 3.6D – Taint Lifecycle Integration

Goal: Make taint propagation piggyback on the same wrappers without custom hacks.

**What "descriptor hints" means**: Evaluators should attach security descriptors directly to `StructuredValue.metadata.security` before returning, so the taint post-hook simply reads from the wrapper instead of scavenging multiple sources.

### Implementation Pattern
**Before (scavenging)**:
```typescript
// Post-hook has to search for descriptors
const resultDescriptor = extractFromValue(result)
  ?? extractFromEnv(env)
  ?? extractFromInputs(inputs);
```

**After (wrapper-based)**:
```typescript
// Evaluator attaches before returning
const result = wrapStructured(data, 'json', text, {
  security: mergedInputDescriptors
});
// Post-hook just reads result.metadata.security
```

### Specific Changes
1. **`processPipeline`** (already done in Week 1-2): Attaches merged stage descriptors to final StructuredValue
2. **`/run` directive**: Shell command results already wrapped with `deriveCommandTaint`; verify descriptor flows to wrapper
3. **`/show` directive**: Merges descriptors before wrapping output (lines 1166-1197 already correct)
4. **`/output` directive**: Verify output StructuredValues carry input descriptors through write path
5. **`/exe` invocation**: Template executables attach merged parameter descriptors (fixed in Week 1)

### `/var` Simplification
Current Week 1 fix makes `/var` reuse StructuredValue metadata:
```typescript
// var.ts:805 - NOW INCLUDES existingDescriptor
const finalMetadata = VariableMetadataUtils.applySecurityMetadata(metadata, {
  labels: securityLabels,
  existingDescriptor: resolvedValue.metadata?.security  // ✅ Direct reuse
});
```

**Result**: No more ad-hoc snapshot merges. Variable creation reads descriptor from StructuredValue wrapper, done.

### `.ctx` Immediate Visibility
Once StructuredValue `.ctx` property is implemented (Week 3 decision), descriptors are visible immediately:
```typescript
const sv = wrapStructured(data, 'json', text, { security: descriptor });
console.log(sv.ctx.labels);  // ✅ Works without Variable assignment
```

### Conformance Tests
Add to existing fixture suites:
- **`tests/interpreter/security-metadata.test.ts`**: Assert StructuredValue wrappers have `.metadata.security` after each evaluator
- **`tests/cases/slash/var/pipeline-taint.md`**: Verify `/var @x = pipeline` has `@x.ctx.taint` immediately
- **`tests/cases/slash/show/taint-preservation.md`**: Verify `/show @structured.ctx` reads descriptor from wrapper
- **`tests/cases/slash/output/taint-metadata.md`**: Verify output files carry security metadata through write

### Success Criteria
- [ ] All evaluators return StructuredValues with `.metadata.security` attached
- [ ] Post-hooks read descriptors from wrappers, not environment snapshots
- [ ] `/var` assignments preserve StructuredValue descriptors with zero custom logic
- [ ] `.ctx` access works on both Variables and StructuredValues
- [ ] No "scavenging" code remains (descriptor sources are explicit)

## Phase 3.6E – Conformance & Documentation

Goal: Lock the behavior and codify it for future work.

### Test Expansion

#### 1. Issue 435 Fixtures - Add Taint Assertions
Expand existing fixtures with `.ctx` checks:

**`tests/cases/integration/issue-435-template-foreach/`**:
```mlld
# Add to expected.md:
/show @gi.ctx.labels     # Expected: ["untrusted"] or []
/show @gi.ctx.taint      # Expected: "commandOutput"
/show @gi.ctx.sources    # Expected: ["command:echo"]
```

**`tests/cases/integration/issue-435-shell-interpolation/`**:
```mlld
# Add taint tracking for shell boundary
/var @result = /run { echo "@data" }
/show @result.ctx.taint  # Expected: "commandOutput"
```

**All 6 issue-435 fixtures** get `.ctx` assertions added.

#### 2. Taint Lifecycle Test Suite
**New**: `tests/cases/integration/taint-lifecycle/`

Five representative scripts covering complete taint flows:

**`lifecycle-pipeline-to-var.md`**:
```mlld
# Pipeline → Variable → .ctx access
/var @raw = "data"
/var @processed = @raw | @transform
/show @processed.ctx.taint    # Expect: commandOutput (if @transform shells)
/show @processed.ctx.labels   # Expect: [] (no explicit labels)
```

**`lifecycle-foreach-taint.md`**:
```mlld
# Foreach with tainted inputs
/var secret @keys = '["key1","key2"]' | @json
/exe @leak(k) = { echo "@k" }
/var @results = foreach @leak(@keys)
/show @results.ctx.labels    # Expect: ["secret"]
/show @results.ctx.taint     # Expect: "commandOutput"
```

**`lifecycle-template-exec.md`**:
```mlld
# Template executable parameter taint
/var secret @token = "abc123"
/exe @render(data) = template { Key: :::@data::: }
/var @output = @render(@token)
/show @output.ctx.labels     # Expect: ["secret"]
```

**`lifecycle-js-propagation.md`**:
```mlld
# JS executable taint propagation
/var untrusted @userInput = "<script>alert(1)</script>"
/exe @sanitize(input) = js { return input.replace(/<[^>]*>/g, ''); }
/var @clean = @sanitize(@userInput)
/show @clean.ctx.labels      # Expect: ["untrusted"]
/show @clean.ctx.taint       # Expect: "commandOutput"
```

**`lifecycle-nested-boundaries.md`**:
```mlld
# Mixed boundaries: pipeline → foreach → template → shell
/var @items = '[1,2,3]' | @json
/exe @process(n) = template { Result: :::@n::: } | @shell_transform
/var @results = foreach @process(@items)
/show @results.ctx.taint     # Expect: "commandOutput"
# Verify: All descriptors merged correctly
```

Each test includes environment snapshot assertions to verify descriptors survive through all boundaries.

#### 3. Edge Case Tests

**`tests/cases/feat/structured-value/ctx-property.md`**:
```mlld
# Test StructuredValue .ctx without Variable assignment
/var @data = '{"a":1}' | @json
# Direct access on intermediate result (no /var)
/show ('{"b":2}' | @json).ctx.type   # Expect: "structured" or appropriate type
```

**`tests/cases/feat/structured-value/nested-metadata.md`**:
```mlld
# Nested StructuredValues preserve element metadata
/var @users = <users.json>    # LoadContentResult with filenames
/var @first = @users[0]
/show @first.ctx.source       # Expect: includes "users.json"
```

**`tests/cases/feat/foreach/array-element-taint.md`**:
```mlld
# Issue 9 edge case: foreach array input metadata
/var secret @arr = '[1,2,3]' | @json
/exe @double(n) = js { return n * 2; }
/var @doubled = foreach @double(@arr)
/show @doubled.ctx.labels     # Expect: ["secret"]
```

### Documentation Updates

#### 1. `docs/dev/DATA.md` - Taint Lifecycle Section
Add new section after "Debugging":

```markdown
## Taint Tracking & Security Metadata

### Overview
All StructuredValues carry security metadata in `.metadata.security` containing:
- `labels`: DataLabel[] - Explicit labels (secret, pii, untrusted, etc.)
- `taintLevel`: TaintLevel - Highest risk level (unknown, trusted, untrusted, commandOutput, etc.)
- `sources`: string[] - Provenance chain (pipeline:stageName, command:echo, etc.)

### Lifecycle Flow

1. **Source**: Directive executes with labeled inputs
   ```mlld
   /var secret @key = "abc123"
   ```

2. **Evaluation**: Result wrapped as StructuredValue with descriptor
   ```typescript
   const result = wrapStructured(data, 'text', text, {
     security: { labels: ['secret'], taintLevel: 'unknown', sources: ['directive:var'] }
   });
   ```

3. **Variable Assignment**: Descriptor preserved in Variable metadata
   ```typescript
   // var.ts uses existingDescriptor to preserve StructuredValue security
   variable.metadata.security === result.metadata.security
   ```

4. **Access**: `.ctx` property exposes metadata
   ```mlld
   /show @key.ctx.labels    # ["secret"]
   /show @key.ctx.taint     # "unknown"
   ```

### Boundary Rules

**Display Boundaries** (use `asText()`):
- Template interpolation: `:::@var:::`
- Shell command arguments: `/run { echo "@var" }`
- CLI/API output: `/show @var`
- Log messages

**Computation Boundaries** (use `asData()`):
- JavaScript function arguments: `/run js { return @var.length; }`
- Array/object operations: `@var[0]`, `@var.field`
- Equality comparisons: `@var == "value"`
- Foreach iteration: `foreach @func(@array)`

**Storage Boundaries** (preserve wrappers):
- Variable assignments: `/var @x = @y`
- Pipeline results: `@var | @transform`
- Foreach results: `foreach @exec(@arr)`
- Function returns

### .ctx Property Specification

Available on both Variables and StructuredValues:

| Property | Type | Example |
|----------|------|---------|
| `.ctx.name` | string | `"myVar"` |
| `.ctx.type` | string | `"structured"` |
| `.ctx.labels` | DataLabel[] | `["secret","untrusted"]` |
| `.ctx.taint` | TaintLevel | `"commandOutput"` |
| `.ctx.sources` | string[] | `["pipeline:cat","command:echo"]` |
| `.ctx.tokens` | number? | `42` |
| `.ctx.length` | number? | `128` |
| `.ctx.policy` | object? | `{"allowShell":false}` |

**Formatting in output**:
- Arrays serialize as JSON: `["secret","untrusted"]`
- Strings as-is: `commandOutput`
- Numbers as-is: `42`

### Troubleshooting Guide

**Symptom**: Double-stringified JSON (`"[{\"file\":1}]"` instead of `[{"file":1}]`)
- **Cause**: StructuredValue unwrapped too early with `asData()` then stringified again
- **Fix**: Keep wrapper in results arrays; only unwrap at computation boundaries
- **Example**: `foreach.ts:160` - change `results.push(asData(value))` to `results.push(value)`

**Symptom**: `.ctx.taint` shows `"unknown"` instead of `"commandOutput"`
- **Cause**: Variable creation doesn't preserve StructuredValue's security descriptor
- **Fix**: Pass `existingDescriptor: resolvedValue.metadata?.security` to `applySecurityMetadata()`
- **Example**: `var.ts:805` - add existingDescriptor parameter

**Symptom**: `.ctx.labels` is `[]` when it should have labels
- **Cause**: Security descriptor not merged from input StructuredValues
- **Fix**: Extract descriptors from inputs before evaluation, merge into result
- **Example**: `exec-invocation.ts:1026` - attach `resultSecurityDescriptor` when re-wrapping

**Symptom**: Bash receives `{"type":"json","text":"...","data":...}` instead of canonical text
- **Cause**: `convertToString()` doesn't check for StructuredValue
- **Fix**: Add `if (isStructuredValue(value)) return asText(value);` before object handling
- **Example**: `bash-variable-adapter.ts:40-83`

**Symptom**: `@var.ctx` is undefined
- **Cause**: Variable doesn't have `.ctx` property attached
- **Fix**: Ensure Variable creation calls `VariableMetadataUtils.attachContext()`
- **Check**: Variable factories should attach .ctx automatically

**Symptom**: Parallel pipeline results lose element metadata
- **Cause**: `extractStageValue()` unwraps StructuredValues with `asData()`
- **Fix**: Preserve StructuredValue wrappers in aggregated array
- **Example**: `executor.ts:838-846` - return wrapper, not unwrapped data
```

#### 2. `spec-security.md` - Update Examples
Add concrete code examples for all `.ctx` access patterns.

#### 3. New: `docs/dev/TROUBLESHOOTING-TAINT.md`
Dedicated troubleshooting guide with diagnostic flowcharts and common patterns (extract the troubleshooting section above into its own doc).

### Fixture Format Updates

#### Update All Fixtures to JSON Array Format
**Before**:
```markdown
Pipeline labels: secret
Pipeline taint: untrusted
```

**After**:
```markdown
Pipeline labels: ["secret"]
Pipeline taint: untrusted
```

**Files to update** (~15 fixtures):
- `tests/cases/security/pipeline-taint/expected.md`
- All issue-435 expected outputs
- Any fixture asserting `.ctx.labels` or `.ctx.sources`

### Success Criteria Checklist

- [ ] All 6 issue-435 fixtures have `.ctx` assertions and pass
- [ ] 5 taint lifecycle tests added and passing
- [ ] 3 edge case tests added and passing
- [ ] DATA.md has complete "Taint Tracking & Security Metadata" section
- [ ] Troubleshooting guide covers all 6 common symptoms from audit
- [ ] spec-security.md examples updated with `.ctx` patterns
- [ ] All fixtures use JSON array format for `.ctx.labels` and `.ctx.sources`
- [ ] CI runs `npm run test:security-taint-debug` successfully
- [ ] No regressions in existing security-metadata.test.ts suite
- [ ] Manual testing: Run `llm/run/security-demo.mld` (if exists) and verify .ctx output

### Acceptance Test
**Create**: `tests/acceptance/taint-end-to-end.md`

Full workflow from secret input → pipeline → foreach → template → shell → variable → .ctx access:
```mlld
# Complete taint propagation flow
/var secret @apiKey = "sk_test_123"
/var @users = '[{"id":1},{"id":2}]' | @json

/exe @buildRequest(key, user) = template {
  Authorization: Bearer :::@key:::
  User: :::@user:::
}

/exe @sendRequest(payload) = bash {
  curl -X POST api.example.com -d "$payload"
}

/var @requests = foreach @buildRequest(@apiKey, @users)
/show @requests.ctx.labels     # Expect: ["secret"]
/show @requests.ctx.taint      # Expect: "commandOutput"

/var @responses = foreach @sendRequest(@requests)
/show @responses.ctx.labels    # Expect: ["secret"]
/show @responses.ctx.taint     # Expect: "commandOutput"
```

If this passes with correct `.ctx` values at every step, Phase 3.6 is complete.

---

**Note**: Phase 3.6E deliverables can be parallelized - docs, tests, and fixtures are independent workstreams.

---

## Phase 3.6B Summary - Current State (2025-11-10 Evening)

### Progress Update

**Tests**: 11 → 8 failures (27% reduction)

**What's Working**:
- ✅ Foreach preserves StructuredValues (verified with CLI)
- ✅ Variables preserve security descriptors
- ✅ StructuredValue `.ctx` property implemented
- ✅ Template executables wrap outputs with metadata
- ✅ Shell commands in pipelines auto-parse JSON (intentional feature #435)

**What's Broken** (8 tests):
- ❌ Batch pipeline edge cases (4 tests) - `=> |` syntax interactions
- ❌ ID array corruption (1 test) - `{id: [1,4]}` merging
- ❌ .ctx access on strings (1 test) - wrapper lost somewhere
- ❌ Other edge cases (2 tests)

**Key Insight Confirmed**:
The auto-parsing added to `command-execution.ts` is **NOT a workaround** - it's implementing the documented behavior from issue #435 and DATA.md. The original bug report explicitly complained about needing `JSON.parse()` in JS functions. The fix ensures shell commands in pipelines pass structured data (objects/arrays) to downstream stages, not JSON strings.

**Lessons for Next Agent**:
1. **Don't question the auto-parsing** - it's intentional, documented, and fixes 2 tests
2. **Do investigate batch pipelines** - `=> |` syntax has issues with StructuredValue arrays
3. **Do use inline effects** - `| output to "/tmp/file.json"` works perfectly for debugging
4. **Don't revert foreach/var/.ctx changes** - they're verified working for simple cases
5. **Do focus on interactions** - bugs are in how subsystems connect, not individual subsystems

**Next Focus**: Batch pipeline handling (Priority 1 in Investigation Roadmap above). This is where most remaining failures cluster.

