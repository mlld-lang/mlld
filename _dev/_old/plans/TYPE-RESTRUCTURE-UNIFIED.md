# Type Unification Strategy

## Current State

The Meld codebase currently has two distinct but overlapping type systems:

1. **`core/ast/types`**: Contains AST node definitions, directive structures, and parsing-related types.
   - More complete and consistent for AST structures
   - Auto-generated from examples via AST Explorer
   - Well-organized with clear structure

2. **`core/types`**: Contains service interfaces, context types, state management, and duplicates of AST types.
   - Valuable for service layer definitions
   - Contains many redundant AST-related types
   - Has unique state and processing types not in core/ast/types

## Unique Value Assessment

After careful analysis, the unique value in `core/types` includes:

1. **Service Interface Types**:
   - IStateService, IResolutionService, IDirectiveHandler
   - Service dependency and configuration types

2. **Context and Configuration Types**:
   - ResolutionContext, FormattingContext, ExecutionContext
   - DirectiveProcessingContext, ProcessOptions

3. **Path and Resource Types**:
   - MeldPath type system, PathValidationRules
   - Security constraints for resource access

4. **State Change Types**:
   - StateChanges, NodeReplacement
   - Transformation tracking

These types build on top of the AST structure to provide higher-level functionality and should be retained.

## Duplication Assessment

Significant duplication exists in:

1. **Node structure types**:
   - BaseMeldNode, TextNode, DirectiveNode, etc.
   - Position, SourceLocation, Range

2. **Directive type definitions**:
   - Various directive structure types
   - DirectiveKind, DirectiveSubtype enums

These duplicated types should be consolidated, with core/ast/types as the authoritative source.

## Unified Type System Plan

### 1. Consolidation Approach

Rather than maintaining two overlapping systems, we'll establish:

- **`core/ast/types`** as the source for all AST structure types
- **`core/types`** for service-related types, with no AST structure duplication
- **`core/types/index.ts`** as the unified export point for all types

### 2. Implementation Steps

#### Phase 1: Fix Critical Misalignments

1. Update core/ast/types/primitives.ts:
   - Add optional filePath to SourceLocation
   - Expand DirectiveSource to include all values

2. Update core/types/index.ts to re-export all AST types:
   ```typescript
   // Re-export all AST types
   export * from '@core/ast/types';
   
   // Service-specific types
   export * from './services/context';
   export * from './state';
   // etc...
   ```

#### Phase 2: Remove Redundant Type Definitions

1. Identify all files in core/types that exclusively contain AST duplications
2. Mark these files as deprecated with clear comments
3. Create a migration plan to remove them entirely
4. Update imports across the codebase to use the re-exported types

#### Phase 3: Consolidate Unique Types

1. Move any remaining unique types from deprecated files into proper service-related files
2. Ensure core/types/index.ts exports all required types
3. Develop clear documentation about the type organization

### 3. Long-term Structure

The final structure should be:

```
core/
├── ast/
│   └── types/           # All AST structure types
│       ├── nodes.ts
│       ├── primitives.ts
│       └── ... (directive-specific types)
└── types/
    ├── index.ts         # Re-exports all types (AST and service)
    ├── state.ts         # State management types
    ├── services/        # Service-specific types
    │   ├── context.ts
    │   └── handlers.ts
    └── ... (other service-specific types)
```

## Migration Impact

This approach will:

1. Reduce confusion about which types to use
2. Eliminate duplication and potential inconsistencies
3. Create a cleaner, more maintainable codebase
4. Allow for single-point imports via `@core/types`

The impact on existing code will be minimal if we:
1. Keep core/types/index.ts exporting all types
2. Rename any conflicting types only when needed

## Next Steps

1. Fix the critical misalignments in core/ast/types
2. Update core/types/index.ts to re-export AST types
3. Create a list of files to deprecate and eventually remove
4. Document the type organization for future contributors