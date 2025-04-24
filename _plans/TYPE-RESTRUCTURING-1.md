# Type Restructuring Phase 1: Variable and State Type Consolidation

This document outlines a focused approach to implementing the already established type system decisions for Meld, specifically focusing on standardizing variable types and state change representations across the codebase. This implementation builds on the completed work from previous plans (PLAN-TYPES.md, STATE-UPDATES-done.md, PLAN-PHASE-5B-done.md, AST-VARIABLES-done.md).

## Goals

- Enforce the canonical `VariableType` enum from `/core/types/variables.ts` throughout the codebase
- Eliminate redundant type definitions by using the established interfaces
- Standardize state change representation across all services
- Ensure consistent usage of the type system for improved debugging and maintenance

## Current State Assessment

1. **Canonical types are already well-defined in `/core/types/variables.ts`**:
   - `VariableType` enum with `TEXT`, `DATA`, `PATH`, `COMMAND` values
   - `BaseVariable<T>` interface with proper discriminated union pattern
   - Specific variable interfaces and factory functions
   - `MeldVariable` union type

2. **However, inconsistencies exist**:
   - Competing `VariableType` definition in `/core/syntax/types/variables.ts` (string union with `'text' | 'data' | 'path'`)
   - Redundant `VariableValueDefinition` in DirectiveService instead of using `VariableDefinition`
   - Inconsistent state change representation in different services

## Implementation Plan

### Step 1: Enforce the Canonical VariableType (1 day)

- [x] 1. **Update `/core/syntax/types/variables.ts`**
   - Replace the string union definition with imports from the canonical source:
   ```typescript
   import { VariableType } from '@core/types/variables';
   export { VariableType };
   ```

- [x] 2. **Fix all references to the string literal version**
   - Update imports to use the canonical enum
   - Replace string literals with enum values (e.g., `'text'` → `VariableType.TEXT`)
   - Update type guards and checks to use the enum values

- [x] 3. **Find and fix all inconsistent imports**
   - Identify files importing the string union version
   - Update to import from the canonical source

#### Files to Modify:
- [x] `/core/syntax/types/variables.ts` (update to use canonical)
- [x] `/core/syntax/types/interfaces/IVariableReference.ts` (update references)
- [x] Services and handlers using string literals instead of enum values

### Step 2: Use the Canonical Variable Interfaces (1 day)

1. **Verify the canonical interfaces**
   - [x] The interfaces in `/core/types/variables.ts` are already well-defined:
     - `BaseVariable<T>` with discriminated union pattern
     - Specific interfaces (`TextVariable`, `DataVariable`, etc.)
     - `MeldVariable` union type

2. **Ensure correct imports**
   - [x] Update any file using variable types to import from `/core/types/variables.ts`
   - [x] Replace any homegrown interfaces with the canonical ones

3. **Fix type usages in services**
   - [x] Update service implementations to use the correct variable interfaces
   - [x] Fix type annotations and return values

#### Files to Modify:
- [x] Service implementations using variables
- [x] Mock implementations for testing
- [x] Directive handlers

### Step 3: Standardize State Change Types (1-2 days)

- [x] 1. **Use the canonical `VariableDefinition` type**
   - The core type already exists in `/core/types/variables.ts`:
   ```typescript
   export type VariableDefinition = {
     type: VariableType;
     value: any;
     metadata?: VariableMetadata;
   };
   ```
   - Replace `VariableValueDefinition` in DirectiveService with this canonical type

- [x] 2. **Standardize state change representation**
   - Use a consistent structure in DirectiveResult and StateService:
   ```typescript
   export interface StateChanges {
     variables?: Record<string, VariableDefinition>;
     // Other state aspects as needed
   }
   ```

- [ ] 3. **Update all implementations**
   - Fix directive handlers to use the canonical types
      - [x] PathDirectiveHandler
      - [x] DataDirectiveHandler
      - [x] TextDirectiveHandler
      - [x] RunDirectiveHandler
      - [x] DefineDirectiveHandler      
      - [x] EmbedDirectiveHandler
      - [x] ImportDirectiveHandler
   - [x] Update service interfaces to maintain consistency

#### Files to Modify:
- [x] `/services/pipeline/DirectiveService/types.ts` (replace VariableValueDefinition)
- [x] `/core/directives/DirectiveHandler.ts` (ensure consistent StateChanges)
- [ ] Directive handler implementations using these types (partially complete)

### Step 4: Verification and Testing (1 day)

1. **Run existing tests**
   - [x] Verify tests pass with the standardized types
   - [ ] Fix any runtime issues that emerge

2. **Add specific type tests**
   - [ ] Add tests to verify type safety with the discriminated unions
   - [ ] Test that directive results correctly propagate state changes

3. **Documentation and cleanup**
   - [ ] Update comments to reflect the standardized types
   - [ ] Remove any unused imports or redundant definitions
   - [ ] Create clear examples of correct usage

## Implementation Examples

### Updating Imports to Use Canonical VariableType

```typescript
// BEFORE (in some service file)
import { VariableType } from '@core/syntax/types/variables';
// ...code using 'text' string literals...

// AFTER
import { VariableType } from '@core/types/variables';
// ...code using VariableType.TEXT enum values...
```

### Standardizing DirectiveResult and StateChanges

```typescript
// In /services/pipeline/DirectiveService/types.ts

// BEFORE
export interface VariableValueDefinition {
  type: VariableType;
  value: any;
  metadata?: VariableMetadata;
}

export interface DirectiveResult {
  stateChanges?: {
    variables?: Record<string, VariableValueDefinition>;
  };
}

// AFTER
import { VariableDefinition } from '@core/types/variables';

export interface StateChanges {
  variables?: Record<string, VariableDefinition>;
}

export interface DirectiveResult {
  stateChanges?: StateChanges;
}
```

### Updating a Directive Handler to Use Canonical Types

```typescript
// BEFORE
import { VariableType } from '@core/syntax/types/variables';
// ...
return {
  stateChanges: {
    variables: {
      [variableName]: {
        type: 'text', // String literal
        value: resolvedValue
      }
    }
  }
};

// AFTER
import { VariableType } from '@core/types/variables';
// ...
return {
  stateChanges: {
    variables: {
      [variableName]: {
        type: VariableType.TEXT, // Enum value
        value: resolvedValue
      }
    }
  }
};
```

This implementation plan focuses on standardizing our already-established type system rather than creating new structures. The core types in `/core/types/variables.ts` are well-designed - we simply need to ensure they're used consistently throughout the codebase.

## Files to Update

1. **Core Type Definitions**
   - `/core/types/variables.ts`
   - `/core/types/index.ts`
   - `/core/directives/DirectiveHandler.ts`
   - `/core/syntax/types/variables.ts`
   - `/core/syntax/types/interfaces/IVariableReference.ts`

2. **Service Interfaces and Implementations**
   - `/services/pipeline/DirectiveService/types.ts`
   - `/services/pipeline/DirectiveService/handlers/**/*.ts`
   - `/services/state/StateService/IStateService.ts`
   - `/services/state/StateService/StateService.ts`

3. **Test and Mock Files**
   - Any tests using variable types
   - Any mocks implementing these interfaces

## Success Criteria

1. All variable references use the same enum definition
2. One canonical implementation of variable interfaces exists
3. State changes use consistent types throughout the codebase
4. All tests pass with the new type system
5. Better debuggability of variables and state

## Timeline

- **Step 1:** 1-2 days
- **Step 2:** 1-2 days
- **Step 3:** 1-2 days
- **Step 4:** 1 day

Total: 4-7 days for complete implementation
