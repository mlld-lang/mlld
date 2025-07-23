# Technical Debt: Resolve Circular Dependencies in Variable Resolution

## Priority: Medium

## Summary
The variable resolution system uses dynamic imports to avoid circular dependencies, which suggests architectural coupling that could be improved. This pattern appears in multiple places and makes the code harder to understand and maintain.

## Current State
Dynamic imports are used in several locations to avoid circular dependencies:

### In `interpreter/utils/variable-resolution.ts`:
```typescript
// Line 107-108
const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');

// Line 155-156
const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');

// Line 170
const { evaluateExecInvocation } = await import('../eval/exec-invocation');
```

### In `interpreter/core/interpreter.ts`:
```typescript
// Line 427
const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');

// Line 432
const { accessField } = await import('../utils/field-access');
```

## Root Cause Analysis
The circular dependencies occur because:

1. **Variable resolution** needs to evaluate complex data structures
2. **Data evaluators** need to resolve Variables during evaluation
3. **Interpreter** needs both resolution and evaluation capabilities
4. **All modules** are tightly coupled through shared types and functionality

## Proposed Solution
Restructure the architecture to eliminate circular dependencies:

### Option 1: Extract Shared Interfaces
Create a new module for shared interfaces and types:

```typescript
// New file: interpreter/core/variable-interfaces.ts
export interface VariableResolver {
  resolveVariable(variable: Variable, env: Environment, context: ResolutionContext): Promise<Variable | any>;
}

export interface DataEvaluator {
  evaluateDataValue(value: any, env: Environment): Promise<any>;
}
```

### Option 2: Dependency Injection
Use dependency injection to break the cycles:

```typescript
// interpreter/utils/variable-resolution.ts
export class VariableResolver {
  constructor(private dataEvaluator?: DataEvaluator) {}
  
  async resolveVariable(variable: Variable, env: Environment, context: ResolutionContext) {
    if (this.dataEvaluator && needsEvaluation) {
      return await this.dataEvaluator.evaluateDataValue(variable.value, env);
    }
    // ... rest of logic
  }
}
```

### Option 3: Event-Driven Architecture
Use an event system to decouple modules:

```typescript
// interpreter/core/variable-events.ts
export class VariableEventBus {
  emit(event: 'evaluate-data', data: any, env: Environment): Promise<any>;
  emit(event: 'resolve-variable', variable: Variable, context: ResolutionContext): Promise<any>;
}
```

## Affected Files
- `/Users/adam/dev/mlld/interpreter/utils/variable-resolution.ts` - Lines 107-108, 155-156, 170
- `/Users/adam/dev/mlld/interpreter/core/interpreter.ts` - Lines 427, 432
- `/Users/adam/dev/mlld/interpreter/eval/data-value-evaluator.ts` - Likely imports variable-resolution
- `/Users/adam/dev/mlld/interpreter/eval/exec-invocation.ts` - Part of circular dependency chain

## Recommended Approach
**Option 1 (Extract Shared Interfaces)** is recommended because:
- Minimal code changes required
- Preserves existing functionality
- Clear separation of concerns
- No performance impact

## Implementation Steps
1. **Create shared interfaces module** with common types
2. **Update imports** to use shared interfaces instead of concrete implementations
3. **Implement dependency injection** for complex cases
4. **Test thoroughly** to ensure no functionality is broken
5. **Remove dynamic imports** and replace with static imports

## Benefits
1. **Better Architecture**: Clear dependency graph
2. **Improved Performance**: No runtime import resolution
3. **Better IDE Support**: Static imports enable better IntelliSense
4. **Easier Testing**: Dependencies can be mocked more easily
5. **Cleaner Code**: No async imports in synchronous contexts

## Risk Assessment
- **Medium Risk**: Requires careful refactoring of core modules
- **High Impact**: Will improve overall architecture significantly
- **Breaking Changes**: None expected (internal refactoring only)

## Success Metrics
- Eliminate all dynamic imports in variable resolution
- Reduce coupling between evaluation and resolution modules
- Improve TypeScript compilation speed
- Better test coverage through improved mockability

## Related Issues
- Legacy code cleanup (may reduce some circular dependencies)
- Field access consolidation (may interact with resolution patterns)