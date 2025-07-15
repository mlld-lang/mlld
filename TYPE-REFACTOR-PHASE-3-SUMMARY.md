# Type Refactor Phase 3: Variable Preservation Infrastructure

## Overview
Phase 3 implements the core infrastructure for preserving Variables through the evaluation system instead of extracting raw values immediately. This phase introduces context-aware resolution and feature flags for gradual adoption.

## Key Commits
- `cb9fb75c` - Phase 3 foundation (ResolutionContext, enhanced functions, migration wrappers)
- `44203f05` - Phase 3 implementation with var.ts integration and build fix

## What Was Built

### 1. Resolution Context System
**File**: `interpreter/utils/variable-resolution.ts`

Created `ResolutionContext` enum to determine when to preserve vs extract Variables:
```typescript
export enum ResolutionContext {
  // Contexts where we SHOULD preserve Variables
  VariableAssignment = 'variable-assignment',
  ArrayElement = 'array-element', 
  ObjectProperty = 'object-property',
  FunctionArgument = 'function-argument',
  PipelineStage = 'pipeline-stage',
  
  // Contexts where we MUST extract values
  StringInterpolation = 'string-interpolation',
  CommandExecution = 'command-execution',
  FileOutput = 'file-output',
  Conditional = 'conditional',
  Display = 'display'
}
```

### 2. Enhanced Resolution Functions
**File**: `interpreter/core/interpreter-enhanced.ts`

Context-aware functions that preserve Variables when appropriate:
- `resolveVariableValue()` - Checks context before extracting
- `interpolateWithContext()` - Preserves Variables in arrays/objects
- `getInterpolationContext()` - Determines context from parent node

### 3. Migration Infrastructure
Created migration wrappers with feature flags for gradual adoption:

**`interpreter/core/resolution-migration.ts`**:
- Wraps `resolveVariableValue()` with `MLLD_ENHANCED_RESOLUTION` flag
- Allows switching between original and enhanced behavior

**`interpreter/eval/var-migration.ts`**:
- Wraps array evaluation with `MLLD_ENHANCED_ARRAYS` flag
- Delegates to enhanced or original implementation

**`interpreter/core/interpolate-migration.ts`**:
- Enhanced interpolation with `MLLD_ENHANCED_INTERPOLATION` flag
- Context hints for array/object/string interpolation

### 4. Enhanced Array Evaluation
**File**: `interpreter/eval/var-enhanced.ts`

Key change: `VariableReference` nodes now return the Variable itself instead of extracting the value when in array/object contexts.

### 5. Integration with var.ts
Modified `evaluateArrayItem()` to use enhanced evaluation when feature flag is enabled:
```typescript
async function evaluateArrayItem(item: any, env: Environment): Promise<any> {
  // If enhanced arrays are enabled, use the enhanced version
  if (process.env.MLLD_ENHANCED_ARRAYS === 'true') {
    const { evaluateArrayItemEnhanced } = await import('./var-enhanced');
    return evaluateArrayItemEnhanced(item, env);
  }
  // ... original implementation
}
```

## Critical Fixes

### 1. Circular Dependency Resolution
**Problem**: Importing `evaluateDataValue` created circular dependencies causing "PrimitiveEvaluator is not a constructor" errors.

**Solution**: Used dynamic imports in `variable-resolution.ts`:
```typescript
if (complexFlag) {
  // Dynamic import to avoid circular dependency
  const { evaluateDataValue } = await import('@interpreter/eval/data-values');
  const evaluatedValue = await evaluateDataValue(variable.value, env);
  // ...
}
```

### 2. Build Error Fix
**Problem**: `../utils/markdown` module didn't exist in var-enhanced.ts

**Solution**: Corrected import to use `./show` where `extractSection` is actually exported.

### 3. Feature Flag State Issue
**Problem**: Feature flag checks were using module-level constants instead of runtime values.

**Solution**: Changed to check `process.env` directly in flag check functions.

## Testing Strategy

### Integration Tests
**File**: `interpreter/eval/phase3-integration.test.ts`

Tests verify:
1. Variables are preserved in arrays when enhanced mode is enabled
2. Values are extracted when enhanced mode is disabled  
3. Variables are preserved in nested object properties
4. Manual evaluation of complex arrays/objects works correctly

### Test Challenges Overcome
- Complex arrays store AST nodes that need lazy evaluation
- Had to manually evaluate array items in tests to avoid circular dependencies
- Different behavior needed for enhanced vs normal mode

## Current State
- All 858 tests passing
- Build succeeds
- Feature flags control enhanced behavior:
  - `MLLD_ENHANCED_ARRAYS=true` - Preserve Variables in arrays
  - `MLLD_ENHANCED_RESOLUTION=true` - Use context-aware resolution
  - `MLLD_ENHANCED_INTERPOLATION=true` - Enhanced interpolation

## How It Works

### Example: Array with Variables
```typescript
// User writes:
/var @arr = [@var1, @var2, "literal"]

// Without enhancement (current):
arr = ["value1", "value2", "literal"]  // Variables extracted

// With enhancement (new):
arr = [Variable<var1>, Variable<var2>, "literal"]  // Variables preserved
```

### Example: Type Detection
```typescript
// Without enhancement:
if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
  // Unreliable - matches any string array
}

// With enhancement:
if (isVariable(value[0]) && value[0].metadata?.arrayType === 'renamed-content') {
  // Reliable - checks actual metadata
}
```

## Key Insights

1. **Lazy Evaluation is Critical**: Complex arrays/objects store AST nodes, not evaluated values. This is by design for lazy evaluation.

2. **Circular Dependencies are Tricky**: The eval system has complex interdependencies. Dynamic imports are necessary in some places.

3. **Feature Flags Enable Safety**: Can test enhanced behavior without breaking existing functionality.

4. **Tests Don't Catch Build Errors**: Tests pass in development but build can still fail. Always run `npm run build` before committing.

## What's NOT Done Yet

1. **Enhanced Mode Not Default**: Feature flags must be manually enabled
2. **Core Interpolation Not Updated**: Still using original interpolate() 
3. **Performance Not Validated**: Need to profile Variable preservation overhead
4. **Not All Contexts Implemented**: Only array/object evaluation uses enhancement

## Next Steps for Implementation

1. Enable enhanced mode in more evaluators (templates, commands, etc.)
2. Update core interpolation to use enhanced version
3. Performance profiling and optimization
4. Gradually make enhanced mode the default
5. Eventually remove old code paths

## Files Modified in Phase 3

### New Files Created:
- `interpreter/utils/variable-resolution.ts` (enhanced from Phase 1)
- `interpreter/core/interpreter-enhanced.ts`
- `interpreter/core/resolution-migration.ts`
- `interpreter/eval/var-migration.ts`
- `interpreter/core/interpolate-migration.ts`
- `interpreter/eval/phase3-integration.test.ts`

### Files Modified:
- `interpreter/eval/var.ts` - Added enhanced array evaluation
- `interpreter/eval/var-enhanced.ts` - Fixed import path
- `TYPE-REFACTOR-ACTUAL-PLAN.md` - Updated progress

## Success Metrics Achieved
- ✅ Variables preserved in arrays/objects (with flag)
- ✅ Type information flows through evaluation
- ✅ All tests pass (858)
- ✅ Build succeeds
- ✅ No breaking changes
- ⏳ Performance impact unknown