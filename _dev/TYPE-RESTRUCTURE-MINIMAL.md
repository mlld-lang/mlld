# Minimal Type System Strategy

## Architectural Philosophy Shift

The Meld codebase is undergoing a fundamental architectural shift:

1. **Original Approach**: Each service did significant heavy lifting to manage data as it moved through the system
   - Required complex context objects
   - Needed extensive service interfaces
   - Relied on multiple transformation steps

2. **New Direction**: Strong typing throughout with state objects as dumb wrappers for robust types
   - Discriminated unions for type-safe node handling
   - State becomes primarily a typed container
   - AST nodes carry more type information

This shift dramatically reduces the need for many existing types, allowing for a much more streamlined type system.

## Type Elimination Assessment

### Types That Can Be Eliminated Entirely

1. **dependencies.ts**
   - Primarily represents the old service dependency model
   - Less relevant with strongly typed state objects
   - The `SERVICE_DEPENDENCIES` constant becomes unnecessary

2. **resolution.ts**
   - Contains complex context objects no longer needed
   - `ResolutionContext`, `ResolutionFlags`, `FormattingContext` represent the old approach
   - Strong typing in AST nodes eliminates need for complex resolution contexts

3. **ast-nodes.ts**
   - Contains duplicate/simplified versions of AST types
   - Should be replaced entirely by core/ast/types
   - No longer serves a purpose with the robust AST types

### Types That Need Significant Simplification

1. **variables.ts**
   - Core variable type system should remain
   - Factory functions may be unnecessary if state maintains type integrity
   - `VariableMetadata` and tracking could be streamlined

2. **state.ts**
   - `IStateService` interface needs radical simplification
   - Should focus on being a typed container rather than providing behaviors
   - Many transformation methods become unnecessary

3. **paths.ts**
   - Path type system has valuable branded types approach
   - Many path state interfaces have overlapping concepts
   - Could be consolidated significantly

### Types That Remain Essential

1. **guards.ts**
   - Type guards remain critical for runtime type checking
   - Especially important with discriminated union approach

2. **exec.ts**
   - Execution-related types for command handling

## Minimal Type System Design

### Primary Components

1. **AST Type System** (from core/ast/types)
   - Complete node type definitions
   - Directive structure types
   - Type guards for AST nodes

2. **State Container Types**
   - Minimal state container interface
   - Variable type definitions
   - Path type definitions

3. **Service Interface Types**
   - Simplified service interfaces
   - Configuration options

### Implementation Approach

#### Phase 1: Centralize on AST Types

1. Update core/types/index.ts to re-export all AST types:
   ```typescript
   // Re-export all AST types
   export * from '@core/ast/types';
   ```

2. Mark duplicative types for removal:
   ```typescript
   // In core/types/ast-nodes.ts
   /**
    * @deprecated Use types from @core/ast/types instead.
    * This file will be removed in a future version.
    */
   ```

#### Phase 2: Streamline State Types

1. Radically simplify IStateService to focus on being a typed container:
   ```typescript
   export interface IStateService {
     // Core data access
     getVariables(): Record<string, MeldVariable>;
     getNodes(): Record<string, MeldNode>;
     
     // Minimal mutation methods
     addVariable(name: string, variable: MeldVariable): void;
     addNode(id: string, node: MeldNode): void;
     
     // Clone and basic operations
     clone(): IStateService;
   }
   ```

2. Simplify path and variable handling to leverage discriminated unions more effectively

#### Phase 3: Clean Up and Document

1. Remove all unnecessary type files
2. Document the minimal type system
3. Update imports across the codebase

## Migration Strategy

1. Start by importing from @core/ast/types exclusively for all AST-related types
2. Begin simplifying service interfaces incrementally
3. Gradually move toward the minimal state container model

## Conclusion

The new architectural direction allows for a dramatically simplified type system that:

1. Centralizes on robust AST types from core/ast/types
2. Treats state as a simple typed container
3. Eliminates complex context objects and transformation types
4. Relies on discriminated unions for type safety

This minimal approach aligns with the architectural shift toward stronger typing throughout the codebase and will result in a more maintainable, less complex system.