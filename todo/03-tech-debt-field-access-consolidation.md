# Technical Debt: Consolidate Field Access Return Types

## Priority: Medium

## Summary
The field access implementation in the Variable Type System has inconsistent return types, making it harder to use and understand. The `accessField()` function can return either a raw value or a `FieldAccessResult` object depending on the `preserveContext` option.

## Current State
```typescript
// Current implementation with multiple return types
export function accessField(value: any, field: FieldAccessNode, options?: FieldAccessOptions): any | FieldAccessResult
```

This dual return type creates complexity:
- Callers must handle two different return types
- Type safety is reduced
- The API is less intuitive

## Proposed Solution
Simplify to a single return type that always includes context:

```typescript
// Proposed: Single return type with context
export function accessField(value: any, field: FieldAccessNode): FieldAccessResult {
  // Always return FieldAccessResult
  return {
    value: accessedValue,
    parentVariable: parentVar,
    accessPath: [...],
    isVariable: isVariable(accessedValue)
  };
}

// For backward compatibility, add a simple helper
export function accessFieldValue(value: any, field: FieldAccessNode): any {
  return accessField(value, field).value;
}
```

## Affected Files
- `/Users/adam/dev/mlld/interpreter/utils/field-access.ts` - Main implementation
- `/Users/adam/dev/mlld/interpreter/core/interpreter.ts` - Uses field access in multiple places
- `/Users/adam/dev/mlld/interpreter/eval/show.ts` - Lines 182-206 use field access
- `/Users/adam/dev/mlld/interpreter/eval/var.ts` - Lines 324-361 use enhanced field access

## Benefits
1. **Consistency**: Single return type makes the API predictable
2. **Type Safety**: TypeScript can better infer types with consistent returns
3. **Extensibility**: FieldAccessResult can be extended without breaking changes
4. **Debugging**: Access path tracking is always available

## Implementation Notes
- The change should be backward compatible by providing the `accessFieldValue()` helper
- Update all callers to use the appropriate function
- Consider deprecating the `options` parameter approach
- Ensure Variable preservation logic remains intact

## Related Issues
- Circular dependency issues (dynamic imports in variable-resolution.ts)
- Complex branching logic in field access implementation