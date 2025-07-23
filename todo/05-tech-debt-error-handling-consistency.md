# Technical Debt: Standardize Error Handling Patterns in Variable System

## Priority: Low

## Summary
Error handling patterns vary slightly between modules in the Variable Type System, though they are generally consistent. Some modules use different error types, message formats, and error propagation patterns which could be standardized.

## Current State
Different error handling approaches exist across the Variable system:

### Variable Resolution Module:
```typescript
// interpreter/utils/variable-resolution.ts - Uses generic Error
throw new Error(`Variable not found: ${varName}`);
```

### Field Access Module:
```typescript
// interpreter/utils/field-access.ts - Uses generic Error with detailed messages
throw new Error(`Cannot access field "${name}" on non-object value`);
throw new Error(`Array index ${index} out of bounds (array length: ${items.length})`);
```

### Show Evaluator:
```typescript
// interpreter/eval/show.ts - Uses generic Error
throw new Error(`Variable not found: ${varName}`);
```

### When Evaluator:
```typescript
// interpreter/eval/when.ts - Uses specialized MlldConditionError
throw new MlldConditionError(
  `Invalid when modifier: ${modifier}`,
  modifier as 'first' | 'all' | 'any' | 'default',
  node.location
);
```

## Issues Identified

### 1. Inconsistent Error Types
- Some modules use generic `Error`
- Others use specialized error classes like `MlldConditionError`
- No clear pattern for when to use which type

### 2. Variable Error Message Formats
```typescript
// Different formats for similar errors:
throw new Error(`Variable not found: ${varName}`);           // show.ts
throw new Error(`Variable not found: ${node.identifier}`);  // interpreter.ts
throw new Error(`Variable not found for index: ${field.value}`); // field-access.ts
```

### 3. Context Information Inconsistency
- Some errors include source location information
- Others don't provide context about where the error occurred
- Variable type information is sometimes missing

## Proposed Solution
Standardize error handling with consistent patterns:

### 1. Use Specialized Error Classes
```typescript
// New error classes for Variable system
export class MlldVariableError extends Error {
  constructor(
    message: string,
    public variableName: string,
    public context?: string,
    public sourceLocation?: SourceLocation
  ) {
    super(message);
    this.name = 'MlldVariableError';
  }
}

export class MlldFieldAccessError extends Error {
  constructor(
    message: string,
    public fieldName: string,
    public targetType: string,
    public sourceLocation?: SourceLocation
  ) {
    super(message);
    this.name = 'MlldFieldAccessError';
  }
}
```

### 2. Standardize Error Messages
```typescript
// Standard error message templates
const ErrorMessages = {
  VARIABLE_NOT_FOUND: (name: string) => `Variable '${name}' not found`,
  FIELD_ACCESS_FAILED: (field: string, type: string) => `Cannot access field '${field}' on ${type}`,
  ARRAY_INDEX_OUT_OF_BOUNDS: (index: number, length: number) => `Array index ${index} out of bounds (length: ${length})`,
  INVALID_VARIABLE_TYPE: (name: string, expected: string, actual: string) => `Variable '${name}' expected ${expected}, got ${actual}`,
};
```

### 3. Enhanced Error Context
```typescript
// Helper function for creating Variable errors with context
export function createVariableError(
  template: (name: string) => string,
  variableName: string,
  context?: string,
  location?: SourceLocation
): MlldVariableError {
  return new MlldVariableError(
    template(variableName),
    variableName,
    context,
    location
  );
}
```

## Affected Files

### High Priority (Variable-related errors):
- `/Users/adam/dev/mlld/interpreter/utils/variable-resolution.ts`
- `/Users/adam/dev/mlld/interpreter/utils/field-access.ts`
- `/Users/adam/dev/mlld/interpreter/eval/show.ts`
- `/Users/adam/dev/mlld/interpreter/eval/var.ts`

### Medium Priority (General consistency):
- `/Users/adam/dev/mlld/interpreter/core/interpreter.ts`
- `/Users/adam/dev/mlld/interpreter/eval/when.ts`
- `/Users/adam/dev/mlld/interpreter/eval/pipeline.ts`

## Implementation Steps
1. **Create new error classes** in `@core/errors`
2. **Define standard error message templates**
3. **Update variable-resolution.ts** to use new error types
4. **Update field-access.ts** to use new error types
5. **Update directive evaluators** to use consistent patterns
6. **Add error context helpers** for common scenarios
7. **Update tests** to expect new error types

## Benefits
1. **Consistency**: All Variable-related errors follow same pattern
2. **Better Debugging**: More context in error messages
3. **Error Handling**: Callers can handle specific error types
4. **User Experience**: Better error messages for mlld users
5. **Maintainability**: Centralized error message management

## Success Metrics
- All Variable-related modules use consistent error types
- Error messages include relevant context (variable name, type, location)
- Error handling tests cover new error types
- Improved error message quality in user-facing scenarios

## Risk Assessment
- **Low Risk**: This is primarily cosmetic improvement
- **Medium Impact**: Will improve debugging and user experience
- **No Breaking Changes**: Error types can be gradually adopted

## Related Issues
- Documentation enhancement (error scenarios should be documented)
- Field access consolidation (may change some error patterns)
- Legacy code cleanup (may eliminate some error handling code)