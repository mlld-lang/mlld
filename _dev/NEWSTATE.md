# StateService Simplification Plan

## Overview

This document outlines the plan to simplify StateService to be a truly "dumb" container that aligns with our "AST Knows All" philosophy. The new StateService will only store and retrieve data, with all intelligence residing in the AST types and service layer.

## Current State vs. Target State

### Current StateService (Overly Complex)
- ~1000+ lines of code
- Complex parent-child state relationships
- Transformation tracking and management
- Event system integration
- Debug/tracking infrastructure
- Type-specific methods (setTextVar, setDataVar, etc.)
- Immutability controls
- State merging logic

### Target StateService (Simple Container)
- ~50-100 lines of code
- Simple storage for variables and nodes
- Basic child state creation
- No transformation logic
- No event system
- Generic variable storage only

## Target Interface

```typescript
export interface IStateService {
  readonly stateId: string;
  
  // Variable storage - using AST's discriminated unions
  getVariable(name: string): MeldVariable | undefined;
  setVariable(variable: MeldVariable): void;
  getAllVariables(): Map<string, MeldVariable>;
  
  // Node storage - for the AST
  addNode(node: MeldNode): void;
  getNodes(): MeldNode[];
  
  // Basic metadata
  currentFilePath: string | null;
  
  // Simple child state creation
  createChild(): IStateService;
}
```

## Implementation Plan

### Phase 1: Create New Interface (1-2 hours)

1. **Create new minimal interface**
   - File: `services/state/StateService/IStateService.minimal.ts`
   - Define the simple interface shown above
   - Import only essential types from `@core/ast/types`

2. **Create simple implementation**
   - File: `services/state/StateService/StateService.minimal.ts`
   - Implement basic storage using Maps and arrays
   - No complex logic, just get/set operations

### Phase 2: Update Service Dependencies (1-2 days)

3. **Update DirectiveService**
   - Change from type-specific methods to generic `setVariable`
   - Remove any dependency on transformation state
   - Simplify state change application

4. **Update directive handlers**
   - Use variable factory functions from AST types
   - Call generic `setVariable` instead of type-specific methods
   - Example transformation:
   ```typescript
   // OLD
   await state.setTextVar(name, value, metadata);
   
   // NEW
   const variable = createTextVariable(name, value, metadata);
   state.setVariable(variable);
   ```

5. **Update InterpreterService**
   - Remove transformation mode checks
   - Simplify node processing
   - Handle all transformations at the handler level

### Phase 3: Remove Complex Features (1 day)

6. **Remove transformation tracking**
   - Delete `transformedNodes` array
   - Remove `transformNode` methods
   - Move any transformation logic to handlers

7. **Remove event system**
   - Delete event service integration
   - Remove state tracking service
   - Clean up debug infrastructure

8. **Remove state management complexity**
   - Delete parent-child merging logic
   - Remove immutability controls
   - Simplify child state creation

### Phase 4: Testing and Validation (1-2 days)

9. **Update StateService tests**
   - Simplify test cases to match new interface
   - Remove tests for deleted features
   - Add tests for new simple behavior

10. **Update integration tests**
    - Ensure handlers work with new state interface
    - Verify InterpreterService still functions correctly
    - Check that DirectiveService applies changes properly

### Phase 5: Cleanup (1 day)

11. **Delete old code**
    - Remove old StateService implementation
    - Delete unused debug services
    - Clean up obsolete type definitions

12. **Update imports**
    - Switch all imports to new minimal StateService
    - Update any remaining type-specific method calls

## Migration Strategy

### Step-by-Step Approach

1. **Run tests before starting** - Establish baseline
2. **Create new implementation alongside old** - Allows gradual migration
3. **Update one service at a time** - Start with DirectiveService
4. **Run tests after each service update** - Catch issues early
5. **Delete old implementation only after all tests pass**

### Rollback Plan

- Keep old StateService implementation until Phase 5
- Use feature flag if needed: `USE_MINIMAL_STATE=true`
- Can revert individual service updates if issues arise

## Key Code Changes

### Example: DirectiveService Update

```typescript
// OLD: Complex state changes with type-specific methods
async applyStateChanges(state: IStateService, changes: StateChanges): Promise<void> {
  if (changes.variables) {
    for (const variable of changes.variables) {
      switch (variable.type) {
        case VariableType.TEXT:
          await state.setTextVar(variable.name, variable.value);
          break;
        case VariableType.DATA:
          await state.setDataVar(variable.name, variable.value);
          break;
        // ... more cases
      }
    }
  }
}

// NEW: Simple, generic approach
applyStateChanges(state: IStateService, changes: StateChanges): void {
  if (changes.variables) {
    for (const variable of changes.variables) {
      state.setVariable(variable);
    }
  }
}
```

### Example: Handler Update

```typescript
// OLD: Handler using type-specific methods
async handle(directive: TextDirective, context: ProcessingContext): Promise<DirectiveResult> {
  const resolvedValue = await this.resolution.resolveInterpolation(directive.values.content);
  await context.state.setTextVar(directive.values.name, resolvedValue);
  return { stateChanges: {} };
}

// NEW: Handler creating typed variables
async handle(directive: TextDirective, context: ProcessingContext): Promise<DirectiveResult> {
  const resolvedValue = await this.resolution.resolveInterpolation(directive.values.content);
  const variable = createTextVariable(directive.values.name, resolvedValue);
  return { 
    stateChanges: { 
      variables: [variable] 
    } 
  };
}
```

## Success Criteria

1. **StateService is under 200 lines of code**
2. **All existing tests pass with new implementation**
3. **No transformation logic in StateService**
4. **No event/tracking system in StateService**
5. **Clear separation between data storage and business logic**

## Timeline

- **Total estimated time**: 4-7 days
- **Can be done incrementally** - Each phase can be completed independently
- **Low risk** - Old implementation kept until final phase

## Next High-Level Steps After This

Once StateService simplification is complete, the next major initiatives should be:

### 1. Complete Service Interface Cleanup (1 week)
- Define clean interfaces for all remaining services
- Remove complex context objects
- Ensure all services use AST types directly

### 2. Verify End-to-End Integration (3-4 days)
- Update `api/` to work with simplified services
- Run full integration tests
- Validate that the complete pipeline works

### 3. Remove Legacy Type System (2-3 days)
- Delete `core/types` duplicates of AST types
- Update `core/types/index.ts` to re-export from `@core/ast/types`
- Fix any remaining import issues

### 4. Documentation and Validation (2-3 days)
- Update architecture documentation
- Create migration guide for any external consumers
- Performance benchmarking of new system

### 5. Future Enhancements (Optional)
- Re-implement debugging at orchestration layer if needed
- Add performance monitoring at InterpreterService level
- Consider caching strategies for repeated operations

The StateService simplification is a critical step that will make all subsequent work easier by establishing a clean, simple foundation for state management.