# Pipeline Retry Implementation Plan

## Executive Summary

The core retry mechanism works correctly. We're now completing the transition to a simplified architecture that removes support for unnecessary nested retries.

**Status**: 🔄 Simplifying Architecture

**Key Insight**: Nested retries are pathological - in pipeline A→B→C, if C retries B, B gets the same input from A and has no legitimate reason to retry A.

## Progress Update (2025-01-13)

### Today's Achievements
- ✅ Evaluated and categorized all retry tests for adaptation
- ✅ Fixed pipeline context parameter passing (`@p` now works as function argument)
- ✅ Updated documentation with comprehensive implementation plan
- 🔍 Identified context attempt tracking bug in simplified state machine

### Next Session Focus
- Fix the `contextAttempt` tracking bug
- Run full test suite with fixes
- Begin updating test expectations

## Current Architecture Status

### ✅ What's Working
- Core retry mechanism (1→2→3 counting)
- Source function re-execution on retry
- Synthetic source stage (`@__source__`)
- Context reuse for same retry pattern
- Basic retry signal detection

### ✅ Recently Fixed
- **Pipeline context parameter passing** - Objects like `@p` now pass correctly as function arguments

### ⚠️ Issues to Fix
1. **Context attempt tracking bug** - `contextAttempt` not incrementing correctly for retrying stages
2. **Test failures** - 19 tests failing with simplified implementation
3. **Architecture cleanup** - Remove old complex implementation

## Implementation Plan

### Phase 1: Fix Critical Issues (Current)

#### 1.1 ✅ Pipeline Context Parameter Passing (FIXED)
**Issue**: `@pipeline.try` (or `@p.try`) not working when passed as function arguments

**Root Cause**: Pipeline context was being converted to JSON string instead of preserved as object

**Solution Implemented**:
- Modified `executor.ts` to preserve raw objects for pipeline context
- Updated `command-execution.ts` to handle raw object arguments
- Pipeline context now passes correctly as live object reference

#### 1.2 Context Attempt Tracking Bug (NEW)
**Issue**: `contextAttempt` stays at 1 for retrying stages even though retry is happening

**Symptoms**:
- `@pipeline.try` shows 1 for showAttempt stage on all retries
- `@pipeline.try` increments correctly for retryThreeTimes stage
- Context IS being reused (attemptNumber increments) but not reflected in stage context

**Root Cause**: In `state-machine-simplified.ts`, the `buildStageContext` method uses:
```typescript
contextAttempt = context.attemptNumber;  // Only if stage is requesting or retrying
```
But this doesn't account for proper attempt tracking when a stage is being retried.

**Files to fix**:
- `interpreter/eval/pipeline/state-machine-simplified.ts` - Fix attempt tracking logic

#### 1.2 Test Evaluation & Adaptation

**Test Categories**:

**A. Tests that work unchanged:**
- `retry-basic` - Basic 1→2→3 retry counting
- `retry-best-of-n` - Collecting attempts and selecting best
- `retry-attempt-tracking` - Tracking `@pipeline.tries`

**B. Tests needing minor fixes:**
- `retry-complex-logic` - Fix `@p.try` parameter passing
- `retry-conditional-fallback` - Likely parameter passing
- `retry-when-expression` - Likely parameter passing

**C. Tests needing adaptation:**
- `pipeline-multi-stage-retry` - Ensure sequential, not nested
- State machine recursive tests - Convert to sequential patterns

### Phase 2: Complete Architecture Transition

#### 2.1 Update State Machine Tests

**Convert recursive tests to sequential:**
```typescript
// OLD: Nested retry (B retrying A while being retried by C)
// NEW: Sequential independent retries + error on nested attempt

describe('Sequential Retry State Machine', () => {
  it('should reuse context for same retry pattern')
  it('should create new context for different pattern')
  it('should throw error on nested retry attempt')
  it('should clear context on requesting stage success')
})
```

#### 2.2 Verify Core Behaviors

**Testing Invariants**:
1. `@pipeline.try` increments within context
2. Context isolation between retry patterns
3. `@pipeline.retries.all` accumulates across contexts
4. Limits enforced (10 per context, 20 global per stage)
5. Context cleared on requesting stage success

**Expected `@pipeline.retries.all` structure**:
```javascript
{
  "context-1": ["attempt1", "attempt2", "attempt3"],
  "context-2": ["attempt1", "attempt2"]
}
```

### Phase 3: Clean Up & Finalize

#### 3.1 Remove Old Implementation
1. Delete old state machine files
2. Rename files (remove 'simplified' suffix):
   - `state-machine-simplified.ts` → `state-machine.ts`
   - `context-builder-simplified.ts` → `context-builder.ts`
3. Remove `MLLD_USE_SIMPLIFIED_RETRY` feature flag
4. Update all imports

#### 3.2 Documentation Updates

**PIPELINE-ARCHITECTURE.md**:
- Remove nested retry examples
- Remove context stack descriptions
- Add "Simplified Retry Model" section
- Document single active context design
- Explain context reuse behavior

**Key addition**:
```markdown
## Simplified Retry Model

Only one retry context is active at a time. When stage N requests retry of stage N-1:
1. Check if context exists for this pattern
2. If yes: reuse and increment attempt
3. If no: create new context
4. Execute retry
5. Clear context when requesting stage completes

### Why No Nested Retries?
In pipeline A → B → C, if C retries B:
- B receives the SAME input from A
- B's logic hasn't changed
- No legitimate reason for B to retry A
- Nested retries indicate pathological design
```

## Migration Strategy

1. **Keep feature flag until all tests pass**
2. **Hard cutover once validated**
3. **Clear error messages for unsupported patterns**

## Test Execution Plan

```bash
# 1. Run with simplified implementation
MLLD_USE_SIMPLIFIED_RETRY=true npm test tests/cases/valid/feat/pipeline/retry*

# 2. Categorize failures:
# - Parameter passing issues (fix first)
# - Expectation mismatches (update tests)
# - Real bugs (fix implementation)

# 3. Update state machine tests
npm test interpreter/eval/pipeline/state-machine*.test.ts
```

## Success Criteria

### Must Have
- [ ] All retry tests passing
- [x] `@p.try` parameter passing working
- [ ] Context attempt tracking fixed
- [ ] Context reuse verified
- [ ] `@pipeline.retries.all` accumulation correct
- [ ] Nested retry error detection
- [ ] Documentation updated

### Nice to Have
- [ ] Performance improvements documented
- [ ] Debug logging enhanced
- [ ] Migration guide for edge cases

## Timeline

1. **✅ Complete**: Fix `@p.try` parameter passing
2. **Current**: Fix context attempt tracking bug
3. **Next**: Run and categorize test failures  
4. **Then**: Update test expectations for single context model
5. **Finally**: Remove old implementation and update docs

## Key Files

### Implementation
- `interpreter/eval/pipeline/state-machine-simplified.ts`
- `interpreter/eval/pipeline/context-builder-simplified.ts`
- `interpreter/eval/pipeline/executor.ts`
- `interpreter/eval/pipeline/unified-processor.ts`

### Tests
- `tests/cases/valid/feat/pipeline/retry-*`
- `interpreter/eval/pipeline/state-machine*.test.ts`

### Documentation
- `PIPELINE-ARCHITECTURE.md`
- `RETRY-DEBUG-REPORT.md` (historical reference)