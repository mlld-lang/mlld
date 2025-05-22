# Type Restructuring Strategic Plan

## Current State Assessment

1. **AST Types (`core/ast/types/`)**: Grammar-generated node types
   - Contains all directive-specific types (run, text, add, etc.)
   - Includes the discriminated union `MeldNode`
   - Has type guards for all node types

2. **Core Types (`core/types/`)**: General system types
   - Services, context, state management
   - Extensions to AST types with runtime information
   - Organized into subdirectories (nodes, directives, services, etc.)

3. **Old Types (to be removed)**: 
   - `core/syntax/types-old/`: Old syntax definitions (renamed but not removed)
   - `core/types-old/`: Old type definitions  

4. **Validation Issues**: 
   - ✅ Fixed `FuzzyMatchingValidator.ts` to import from `@core/ast/types`
   - ✅ Fixed `core/types/state.ts` to import from `@core/ast/types`
   - Remaining issues are primarily in tests and old type directories

## Type Usage Analysis

Based on our comprehensive audit (see TYPE-USAGE-AUDIT.md), we've confirmed:

1. **Type Organization is Sound**:
   - `core/ast/types` - AST node types (from grammar)
   - `core/types` - Runtime extensions and service interfaces

2. **No Missing Types**:
   - All necessary types are covered between these two locations
   - No evidence of needing an additional type location

3. **Old Imports to Fix**:
   - 59 files still import from `@core/syntax/types`
   - 5 files use the old `node.directive.*` pattern

## Strategic Plan

### 1. Fix Remaining Files with Old Imports

1. **Update ValidationService files**:
   - ✅ Fixed `FuzzyMatchingValidator.ts`
   - Fix remaining ValidationService files with old imports:
     - `ValidationService.ts`
     - `ImportDirectiveValidator.ts`
     - `ValidationService.test.ts`
     - `FuzzyMatchingValidator.test.ts`

2. **Fix `node.directive.*` patterns**:
   - Update these patterns to use direct property access (`node.*`)
   - Only present in 5 files, easy to fix

### 2. Update Import Paths in Tests and Services

1. **Prioritize fixing tests**:
   - Tests are safer to update first
   - Update mock structures to match new AST structure

2. **Update service implementations**:
   - Fix DirectiveService handlers
   - Update InterpreterService files

### 3. Clean Up Old Type Directories

1. **Remove old type directories**:
   - After fixing imports, delete `core/syntax/types-old/`
   - Delete `core/types-old/` if no longer needed

2. **Verify removal**:
   - Run tests after removing directories
   - Fix any remaining issues

### 4. Documentation and Standardization

1. **Update type system documentation**:
   - Document canonical type locations
   - Explain relationship between AST types and runtime types

2. **Create usage guidelines**:
   - When to use AST types vs. runtime types
   - How to extend the type system properly

## Implementation Plan

### Phase 1: Fix ValidationService (Highest Priority)

1. Update remaining ValidationService files
2. Fix `node.directive.*` patterns in these files
3. Run tests to verify fixes

### Phase 2: Update Tests and Non-Essential Files

1. Update test imports from `@core/syntax/types` to `@core/ast/types`
2. Fix mock structures in tests
3. Update utility files

### Phase 3: Service Implementation Updates

1. Update DirectiveService handlers
2. Fix InterpreterService imports
3. Update any remaining service implementations

### Phase 4: Cleanup and Documentation

1. Remove old type directories
2. Verify all tests pass
3. Document type system organization and usage

## Validation Strategy

1. **Run Tests Frequently**:
   - After each batch of changes
   - Pay special attention to ParserService tests

2. **Use Modified Script**:
   - Run updated `find-old-type-imports.cjs` after changes
   - Verify number of old imports decreases

3. **Verify Type Safety**:
   - Check for TypeScript errors in editors
   - Ensure no type assertions are needed

## Conclusions

1. The canonical locations are confirmed:
   - AST types: `core/ast/types/`
   - Runtime/system types: `core/types/`

2. We have completed:
   - ✅ Fixed `FuzzyMatchingValidator.ts`
   - ✅ Updated `core/types/state.ts` 
   - ✅ Updated search script to exclude `@core/types`
   - ✅ Added detection for `node.directive.*` patterns
   - ✅ Fixed ValidationService files:
     - ✅ Fixed `ValidationService.ts` to use direct property access
     - ✅ Fixed `ImportDirectiveValidator.ts` to use direct property access
     - ✅ Fixed `ValidationService.test.ts` to use meta property instead of directive

3. Next steps:
   - Continue fixing remaining files with `node.directive.*` patterns
   - Update tests and service implementations
   - Remove old type directories
   - Document type system