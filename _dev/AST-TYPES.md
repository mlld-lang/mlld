# AST Types Refactoring Plan

## Problem Statement

The current approach to AST type management has several issues:

1. **Reverse Engineering Types**: We're trying to derive TypeScript types from AST examples, leading to incomplete type coverage and requiring workarounds
2. **Type Generation Issues**: The AST Explorer is struggling to generate comprehensive types, requiring manual scripts (`create-base-types.js`, `create-union-types.js`)
3. **Inconsistent Source of Truth**: Types are scattered across multiple locations (grammar/types, core/ast/types, generated types)
4. **Maintenance Burden**: Changes to the AST require updating examples, generated types, and workaround scripts

## Solution Overview

Refactor our approach to AST types management:

1. **Handwrite Types**: Define AST types directly in TypeScript instead of generating them from examples (mostly done, but need updating)
2. **Single Source of Truth**: Centralize types in `core/ast/types` (done, but need updating)
3. **Type-Safe Tests**: Update grammar tests (`grammar/tests`) to use type assertions to ensure parser output matches types 
4. **Streamlined AST Explorer**: Keep the useful parts (fixtures and snapshots, which should go to `core/ast/fixtures` and `core/ast/snapshots`) while removing type generation

## Implementation Steps

### 0. AST Explorer Streamlining

The intent is to dramatically simplify the AST Explorer. It originally was built to generate types from the AST, as well as snapshots and fixtures for both unit tests and end-to-end tests. We want to remove the functionality for type generation and just keep the snpashot and fixture generation from the core/examples dir. 

- [ ] Fully review the AST Explorer code and design a plan for the necessary changes. Backward compatibility is not desired.
- [ ] Remove all type generation code from AST Explorer
- [ ] Update the `clean` command in AST Explorer to avoid deleting `core/ast/types`
- [ ] Keep snapshot generation functionality but output to core/ast/snapshots -- need to confirm snapshots are all being generated for examples
- [ ] Keep fixture creation for unit/e2e tests but output to core/ast/fixtures -- need to confirm fixtures are all being generated for examples
- [ ] Update AST Explorer documentation to reflect its new focused purpose
- [ ] Verify snapshot and fixture output for correctness

### 1. Type Reorganization

- [x] Move and consolidate types from `grammar/types` to `core/ast/types`
- [ ] Review actual grammar / generated AST and clean up any inconsistencies or missing types in the AST type definitions
- [ ] Add proper JSDoc comments to types for better documentation
- [ ] Update imports in `core/ast/parser.ts` and `core/ast/index.ts` to use the new types

### 2. Grammar Tests Enhancement

- [ ] Update imports in grammar tests to use the new centralized types
- [ ] Add explicit type assertions to ensure AST output matches expected types
- [ ] Create test factories for generating expected AST structures
- [ ] Add tests for edge cases to ensure robust type coverage

Example of enhanced grammar test:

```typescript
import { parseDirective } from '@core/ast/parser';
import { TextAssignmentDirectiveNode } from '@core/ast/types';

test('parses text assignment correctly', () => {
  const ast = parseDirective('@text greeting = "Hello, world!"');
  
  // Type assertion ensures AST matches the expected type
  const typedAst: TextAssignmentDirectiveNode = ast;
  
  // Additional runtime checks
  expect(typedAst.kind).toBe('text');
  expect(typedAst.subtype).toBe('assignment');
  expect(typedAst.values.name).toBe('greeting');
  expect(typedAst.values.value).toBe('Hello, world!');
});
```
### 3. Build Process Updates

- [ ] Remove scripts/create-base-types.js and scripts/create-union-types.js
- [ ] Update `ast-explorer` to remove type generation steps
- [ ] Update workflow documentation

### 4. Integration and Testing

- [ ] Create comprehensive validation tests to ensure types match parser output
- [ ] Test the complete workflow to verify everything works as expected
- [ ] Update documentation to reflect the new approach

## Migration Considerations

1. **Breaking Changes**: This refactoring will break the current type generation workflow (that's fine)
2. **Manual Type Updates**: Types will need to be manually updated when the AST structure changes
3. **Test Coverage**: Ensure tests cover all directive types and edge cases
4. **Documentation**: Update docs to reflect the new approach to AST types

## Future Maintenance Guidelines

1. **Type-First Approach**: When making changes to the AST, update the types first, then the parser
2. **Test-Driven Development**: Add/update tests when adding/modifying directive types
3. **Synchronization**: Use type assertions in tests to keep types and parser output in sync
4. **Documentation**: Keep type documentation up-to-date to help developers understand the AST structure

## Benefits of This Approach

1. **Simplicity**: Handwritten types are easier to understand and maintain
2. **Reliability**: No more dependency on error-prone type generation
3. **Clarity**: Clear source of truth for AST types
4. **Performance**: Simpler build process without complex type generation
5. **Maintainability**: Easier to update types as AST evolves
6. **Developer Experience**: Better tooling support with explicit types

## Timeline

1. Type Reorganization: 1 day
2. Grammar Tests Enhancement: 1-2 days
3. AST Explorer Streamlining: 1 day
4. Build Process Updates: 0.5 day
5. Integration and Testing: 1-2 days

Total Estimated Time: 4-6.5 days
