# Grammar Consolidation Test Analysis Plan

## Context

We just completed a massive grammar consolidation that eliminated 21+ duplicate patterns and achieved 95% pattern reduction. The consolidation successfully transformed the grammar from a maze of duplicate patterns into a clean, maintainable system following the "abstraction-first design" principle.

**Current Test Status:**
- 742 tests passing (excellent functionality preservation)
- 24 tests failing (down from baseline ~10-20, expected during major consolidation)
- 96% test file pass rate (48 passed, 2 failed, 1 skipped)

## Investigation Mission

**Primary Goal:** Determine if the 24 failing tests represent:
1. **Grammar Issues** - Real problems with our consolidation that need fixes
2. **Test Updates Needed** - Tests expecting old AST structures that need updating
3. **Edge Cases** - Legitimate edge cases exposed by the cleaner grammar
4. **Acceptable Regressions** - Minor changes that are acceptable trade-offs

## Phase 1: Critical Failure Analysis

### 1.1 Get Detailed Test Failure Information
```bash
npm test 2>&1 | grep -A10 -B5 "FAIL\|failing\|failed"
```

### 1.2 Categorize Failures by Type
Look for patterns in failures:
- **AST Structure Changes** - Tests expecting old node structures
- **Parse Errors** - Grammar not parsing what it used to
- **Output Differences** - Different but potentially valid outputs
- **Interpreter Errors** - Runtime issues vs parsing issues

### 1.3 Identify High-Priority vs Low-Priority Failures
**High Priority (Must Fix):**
- Core directive parsing failures (`/run`, `/var`, `/show`, `/when`)
- Basic variable reference failures (`@var`, `@obj.field`)
- Command execution failures
- Import/export functionality breaks

**Medium Priority (Investigate):**
- Edge case syntax that changed behavior
- Complex nested structures
- Template/interpolation differences

**Low Priority (Potentially Acceptable):**
- Minor AST structure differences in non-critical fields
- Test fixtures that were testing implementation details
- Error message changes (if error handling still works)

## Phase 2: Systematic Investigation Process

### 2.1 Individual Test Analysis
For each failing test:

1. **Understand the original intent**
   - What mlld syntax is being tested?
   - What was the expected behavior before consolidation?

2. **Analyze the current result**
   - What does the grammar produce now?
   - Is it functionally equivalent but structurally different?
   - Is it actually broken functionality?

3. **Trace through the grammar changes**
   - Which unified patterns are now being used?
   - Did we change the AST structure for this case?
   - Is the new structure better or worse?

### 2.2 Grammar Change Impact Assessment

**Key Questions for Each Failure:**

1. **Is the new behavior correct according to mlld semantics?**
   - Does the new AST structure make more sense?
   - Is the consolidation working as intended?

2. **Did we accidentally break a feature?**
   - Is functionality lost or just restructured?
   - Are there parsing regressions we need to fix?

3. **Is this a test that needs updating?**
   - Was the test coupled to old AST structures?
   - Should the test be updated to expect the new (better) structure?

### 2.3 Specific Areas to Investigate

Based on our consolidation work, focus on:

**Variable Reference Changes:**
- `@var` → `VariableNoTail` impacts
- `@obj.field()` → `UnifiedReferenceNoTail` impacts  
- Field access patterns in different contexts

**Output Directive Changes:**
- We significantly changed `OutputVariable` pattern
- Check output directive tests specifically

**Inline Pattern Elimination:**
- We replaced inline patterns in `when.peggy`, `exe.peggy`, `run.peggy`
- Check if any tests were expecting the old inline behavior

**Content Pattern Changes:**
- We cleaned up `UnquotedPathVar` in `content.peggy`
- Check path parsing tests

## Phase 3: Decision Framework

For each test failure, apply this decision tree:

```
Is core functionality broken?
├─ YES → High Priority Grammar Fix Needed
└─ NO → Is the new behavior semantically better?
   ├─ YES → Update Test (document why)
   ├─ NO → Medium Priority Grammar Fix
   └─ UNCLEAR → Deep Investigation Required
```

### 3.1 Grammar Fixes Needed
If tests reveal actual grammar problems:
- Document the specific issue
- Identify which unified pattern needs adjustment
- Propose minimal fix that preserves consolidation benefits
- Ensure fix doesn't reintroduce duplicate patterns

### 3.2 Test Updates Needed
If tests need updating to match new (better) AST structures:
- Document why the new structure is better
- Update test expectations
- Ensure test still validates the intended functionality
- Add comments explaining the AST structure change

### 3.3 Edge Case Documentation
If failures reveal edge cases:
- Document the edge case clearly
- Decide if it's worth supporting
- If yes, extend unified patterns to handle it
- If no, document as acceptable limitation

## Phase 4: Implementation Strategy

### 4.1 Fix Grammar Issues First
- Address any real grammar problems
- Run tests after each fix to measure impact
- Ensure fixes maintain the consolidation architecture

### 4.2 Update Tests Systematically
- Group test updates by type of change
- Update in batches to see cumulative impact
- Document rationale for each change

### 4.3 Validate the Fixes
- Ensure original consolidation goals still met
- Verify no old patterns were reintroduced
- Check that core functionality works end-to-end

## Phase 5: Documentation and Handoff

### 5.1 Create Test Analysis Report
Document findings:
- Which failures were grammar issues vs test updates
- What consolidation impacts were revealed
- Recommendations for future grammar changes

### 5.2 Update Consolidation Documentation
- Add any lessons learned
- Document any edge cases discovered
- Update the success metrics based on final test results

## Success Criteria

**Ideal Outcome:**
- 0-5 failing tests (down from 24)
- All critical functionality preserved
- Grammar consolidation benefits maintained
- Test suite accurately reflects new AST structures

**Acceptable Outcome:**
- 5-10 failing tests (if they're documented edge cases)
- No loss of core functionality
- Clear understanding of what changed and why
- Path forward for any remaining issues

## Critical Guidelines

1. **Preserve Consolidation Benefits** - Don't reintroduce duplicate patterns
2. **Maintain AST Philosophy** - New structures should follow "values are node arrays" principle
3. **Document All Changes** - Every test update needs clear rationale
4. **Test Core Use Cases** - Ensure primary mlld workflows still work
5. **Follow Grammar README** - Any grammar fixes must follow the sacred principles

## Files to Focus On

**High-Impact Test Files:**
- `interpreter/interpreter.fixture.test.ts` (main test runner)
- `grammar/tests/*.test.ts` (grammar-specific tests)
- Tests related to directives we modified: `when`, `output`, `exe`, `run`

**Configuration:**
- `tests/fixtures/` (generated fixtures that might need regeneration)
- Test cases in `tests/cases/` that exercise unified patterns

This systematic approach will help determine if our consolidation was successful or if adjustments are needed.