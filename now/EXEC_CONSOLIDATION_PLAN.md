# Exec Invocation Consolidation Plan

## Problem Analysis

Currently, mlld has fragmented exec invocation handling across multiple files, leading to:
- **29 failing tests** due to inconsistent parameter processing
- **Duplicate exec logic** in `data-value-evaluator.ts` vs `exec-invocation.ts`
- **Architectural debt** from the old `/data` and `/text` directive split
- **Two separate files** doing similar data evaluation

## Current State

### Exec Invocation Handling (Fragmented):
1. **exec-invocation.ts**: `evaluateExecInvocation()` - The canonical implementation
2. **data-value-evaluator.ts**: `invokeParameterizedCommand()` - Separate foreach implementation
3. **All other files**: Correctly call `evaluateExecInvocation()` ✅
   - run.ts, output.ts, lazy-eval.ts, show.ts, var.ts, when.ts, interpreter.ts

### Data Evaluation Duplication:
- **lazy-eval.ts** (295 lines): `evaluateDataValue()` function
- **data-value-evaluator.ts** (961 lines): `evaluateDataValue()` function + foreach logic

### Test Failures:
29 failing tests, including:
- `data-exec-invocation-nested`
- `exec-param-at-syntax` 
- `exec-shadow-environment-simple`
- `data-foreach-bash-env`
- `data-foreach-text-template`
- `exec-param-interpolation`

## Root Cause

The issue stems from architectural inconsistency:
- **Direct exec calls**: `/run @greet("Alice")` → uses `evaluateExecInvocation()`
- **Foreach exec calls**: `foreach @greet(@names)` → uses `invokeParameterizedCommand()`

These two paths have different parameter handling logic, causing inconsistent behavior.

## Solution Architecture

### Phase 1: Consolidate Data Evaluation Files
Merge `lazy-eval.ts` and `data-value-evaluator.ts` into a single, clean file.

**New file structure:**
```
interpreter/eval/
├── value-evaluator.ts    # Unified data value evaluation (NEW)
├── foreach.ts            # Dedicated foreach evaluator (NEW)
├── exec-invocation.ts    # Canonical exec implementation (KEEP)
└── [other evaluators]    # Unchanged
```

### Phase 2: Extract Foreach Logic
Move foreach-specific code from data evaluation to dedicated evaluator.

**Extract from data-value-evaluator.ts:**
- `evaluateForeachCommand()`
- `evaluateForeachSection()`
- `invokeParameterizedCommand()` (will be replaced)
- `cartesianProduct()` and validation utilities

### Phase 3: Unify Exec Invocation Paths
Replace `invokeParameterizedCommand()` with calls to `evaluateExecInvocation()`.

**Key architectural change:**
```typescript
// OLD (in foreach)
const result = await invokeParameterizedCommand(cmdVariable, argMap, env);

// NEW (unified)
const execNode: ExecInvocation = {
  type: 'ExecInvocation',
  commandRef: {
    name: commandName,
    args: argumentValues
  }
};
const result = await evaluateExecInvocation(execNode, env);
```

## Detailed Implementation Plan

### Step 1: Create Unified Value Evaluator

**File: `interpreter/eval/value-evaluator.ts`**
- Merge the best parts of `lazy-eval.ts` and `data-value-evaluator.ts`
- Keep only data evaluation logic
- Remove foreach-specific code
- Export: `evaluateDataValue()`, `hasUnevaluatedDirectives()`

### Step 2: Create Dedicated Foreach Evaluator

**File: `interpreter/eval/foreach.ts`**
- Extract foreach command/section evaluation
- Replace `invokeParameterizedCommand()` with `evaluateExecInvocation()` calls
- Keep foreach-specific utilities: validation, cartesian product, etc.
- Export: `evaluateForeachCommand()`, `evaluateForeachSection()`

### Step 3: Update Import Statements

**Files to update:**
- All files currently importing from `data-value-evaluator.ts`
- All files currently importing from `lazy-eval.ts`

**New import pattern:**
```typescript
// Data evaluation
import { evaluateDataValue } from '../eval/value-evaluator';

// Foreach operations  
import { evaluateForeachCommand } from '../eval/foreach';
```

### Step 4: Parameter Processing Consistency

**In exec-invocation.ts**, apply the simplified interpolation pattern:
```typescript
// Simplified parameter processing (already implemented)
for (const arg of args) {
  let argValue: string;
  if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
    argValue = String(arg);
  } else if (arg && typeof arg === 'object' && 'type' in arg) {
    argValue = await interpolate([arg], env, InterpolationContext.Default);
  } else {
    argValue = String(arg);
  }
  evaluatedArgStrings.push(argValue);
}
```

### Step 5: Delete Obsolete Code

**Remove:**
- `invokeParameterizedCommand()` from data-value-evaluator.ts
- Duplicate `evaluateDataValue()` implementations
- Legacy data/text directive handling code

## Expected Outcomes

### Immediate Benefits:
- **Unified exec invocation**: All exec calls use the same proven implementation
- **Consistent parameter handling**: Same logic for direct calls and foreach
- **Reduced code duplication**: ~200 lines of duplicate code eliminated
- **Cleaner architecture**: Single responsibility principle applied

### Test Improvements:
- **29 failing tests should pass**: Unified parameter handling fixes inconsistencies
- **Foreach tests specifically**: `data-foreach-bash-env`, `data-foreach-text-template`, `exec-param-interpolation`
- **All exec tests**: Consistent behavior across direct and foreach invocations

### Maintenance Benefits:
- **Single exec implementation**: Changes only need to be made in one place
- **Clear file organization**: Each file has a single, clear responsibility
- **Reduced cognitive load**: Developers only need to understand one exec pattern

## Risk Assessment

### Low Risk:
- **Well-defined interfaces**: Existing evaluator APIs can be preserved
- **Proven patterns**: Using `evaluateExecInvocation()` that already works everywhere else
- **Incremental approach**: Can be done in phases with testing at each step

### Mitigation Strategies:
- **Comprehensive testing**: Run full test suite after each phase
- **Gradual migration**: Update imports file by file
- **Rollback plan**: Keep backup of original files until fully verified

## File-by-File Changes

### New Files:

**interpreter/eval/value-evaluator.ts:**
- Primary `evaluateDataValue()` function
- Data validation utilities
- No foreach-specific logic

**interpreter/eval/foreach.ts:**
- `evaluateForeachCommand()` using `evaluateExecInvocation()`
- `evaluateForeachSection()` 
- Cartesian product and validation utilities

### Modified Files:

**interpreter/eval/exec-invocation.ts:**
- Keep simplified parameter processing
- Ensure robust handling of all node types via `interpolate()`

**Files importing data evaluation:**
- Update imports to use new `value-evaluator.ts`
- Update foreach imports to use new `foreach.ts`

### Removed Files:

**interpreter/eval/lazy-eval.ts:**
- Logic merged into `value-evaluator.ts`

**interpreter/eval/data-value-evaluator.ts:**
- Data evaluation → `value-evaluator.ts`
- Foreach logic → `foreach.ts`

## Testing Strategy

### Phase Testing:
1. **After consolidation**: Verify data evaluation still works
2. **After foreach extraction**: Verify foreach logic works with new structure  
3. **After unification**: Verify all exec invocations work consistently

### Regression Testing:
- Run full test suite after each phase
- Focus on exec-related tests and foreach tests
- Verify no existing functionality is broken

### Integration Testing:
- Test complex scenarios with nested exec invocations
- Test foreach with various parameter types
- Test exec invocations in different contexts (run, show, output, etc.)

## Success Criteria

- ✅ All 29 failing tests pass
- ✅ No regression in existing functionality
- ✅ Code is more maintainable and easier to understand
- ✅ Consistent exec invocation behavior across all contexts
- ✅ Reduced code duplication and improved architecture