# Technical Debt: Remove Legacy resolveVariableValue Function

## Priority: Medium

## Summary
The `resolveVariableValue()` function in `interpreter/core/interpreter.ts` duplicates logic from the new Variable resolution system. This creates maintenance overhead and potential inconsistencies.

## Current State
The legacy function exists at lines 506-588 in `interpreter/core/interpreter.ts`:

```typescript
async function resolveVariableValue(variable: Variable, env: Environment): Promise<VariableValue> {
  // 80+ lines of type-specific resolution logic
  // Duplicates logic from variable-resolution.ts
}
```

This function:
- Duplicates type checking logic from the new system
- Uses old patterns that were replaced by the Variable Type System refactor
- Is only used in a few places within the same file

## Proposed Solution
Replace all usages of `resolveVariableValue()` with the new `resolveVariable()` and `extractVariableValue()` functions:

```typescript
// Instead of:
const value = await resolveVariableValue(variable, env);

// Use:
const value = await resolveVariable(variable, env, ResolutionContext.StringInterpolation);
// OR
const value = await extractVariableValue(variable, env);
```

## Affected Files
- `/Users/adam/dev/mlld/interpreter/core/interpreter.ts` - Lines 506-588 (function definition)
- `/Users/adam/dev/mlld/interpreter/core/interpreter.ts` - Lines ~800, ~801 (function calls)

## Investigation Required
1. **Find all usages** of `resolveVariableValue()` in the interpreter.ts file
2. **Determine appropriate ResolutionContext** for each usage:
   - String interpolation contexts → `ResolutionContext.StringInterpolation`
   - Display contexts → `ResolutionContext.Display`
   - Other contexts → Evaluate based on usage
3. **Test extensively** to ensure behavior remains consistent

## Benefits
1. **Reduced Code Duplication**: Eliminates ~80 lines of duplicate logic
2. **Consistency**: All Variable resolution goes through the same system
3. **Maintainability**: Single source of truth for Variable resolution
4. **Type Safety**: New system has better TypeScript integration

## Implementation Steps
1. Audit all calls to `resolveVariableValue()` in interpreter.ts
2. Replace each call with appropriate `resolveVariable()` call
3. Import necessary functions from `variable-resolution.ts`
4. Remove the legacy function definition
5. Run full test suite to ensure no regressions

## Risk Assessment
- **Low Risk**: The new system is well-tested and proven
- **High Impact**: Will simplify the codebase significantly
- **Breaking Changes**: None expected (internal refactoring only)

## Related Issues
- Circular dependency patterns in variable-resolution.ts
- Some inconsistent patterns in Variable resolution across the codebase