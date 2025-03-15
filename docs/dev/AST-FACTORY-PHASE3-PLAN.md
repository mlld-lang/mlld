# AST Factory Pattern Implementation - Phase 3 Plan

## Goal

Continue transitioning the codebase to using factory classes for AST node creation by:

1. Updating core parser and transformer implementations to use factory classes directly
2. Removing direct dependencies on legacy node creation functions
3. Reducing circular dependencies in critical services

## Background

- Phase 1: Established interfaces, factory classes, and legacy compatibility layers
- Phase 2: Updated VariableReferenceResolver to use factory classes with backward compatibility
- Phase 3 (this phase): Extend factory pattern adoption to more services and components

## Priority List

### High Priority (Core Services)

1. `/services/pipeline/ParserService/ParserService.ts`
   - Update to use VariableNodeFactory instead of direct node creation
   - Inject factory dependencies via constructor

2. `/services/pipeline/OutputService/OutputService.ts`
   - Update node transformation logic to use factory pattern
   - Replace direct node creation with factory methods

3. `/services/resolution/ResolutionService/resolvers/types.ts`
   - Replace type guards with factory-based implementations
   - Centralize type checking in factories

### Medium Priority (Supporting Services)

4. `/core/ast/grammar/parser.cjs` and related parser files
   - Update generated parser code or post-processing to use factories
   - May require changes to build process for grammar

5. Test files using direct node creation:
   - `/services/resolution/ResolutionService/resolvers/CommandResolver.test.ts`
   - `/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts`
   - `/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts`

### Low Priority (Test Infrastructure)

6. `/tests/utils/testFactories.ts`
   - Update test utility functions to use factory pattern
   - Ensures consistent testing approach

7. Various test files using direct node creation

## Implementation Approach

### For Each Implementation File:

1. **Add Factory Injection**:
   ```typescript
   constructor(
     // Existing dependencies...
     @inject(VariableNodeFactory) private readonly variableNodeFactory?: VariableNodeFactory
   ) {
     // Backward compatibility fallback
     if (!this.variableNodeFactory) {
       this.variableNodeFactory = container.resolve(VariableNodeFactory);
     }
   }
   ```

2. **Replace Direct Node Creation**:
   ```typescript
   // Change from:
   const node = createVariableReferenceNode(identifier, valueType, fields);
   
   // To:
   const node = this.variableNodeFactory.createVariableReferenceNode(identifier, valueType, fields);
   ```

3. **Replace Type Guards**:
   ```typescript
   // Change from:
   if (isVariableReferenceNode(node)) { ... }
   
   // To:
   if (this.variableNodeFactory.isVariableReferenceNode(node)) { ... }
   ```

### For Each Test File:

1. **Create Mock Factories**:
   ```typescript
   const mockVariableNodeFactory = {
     createVariableReferenceNode: vi.fn().mockImplementation((identifier, valueType, fields) => ({
       type: 'VariableReference',
       identifier,
       valueType,
       fields,
       isVariableReference: true
     })),
     isVariableReferenceNode: vi.fn().mockImplementation((node) => {
       return node?.type === 'VariableReference';
     })
   };
   ```

2. **Mock Container Resolution**:
   ```typescript
   vi.spyOn(container, 'resolve').mockImplementation((token) => {
     if (token === VariableNodeFactory) {
       return mockVariableNodeFactory;
     }
     throw new Error(`Unexpected token: ${String(token)}`);
   });
   ```

## Success Criteria

1. All updated files pass their tests
2. No new circular dependencies are introduced
3. Services use factory pattern consistently for AST node creation
4. Legacy compatibility layer remains functional during transition

## Testing Strategy

1. Run unit tests for each modified file
2. Run integration tests to verify system-level functionality
3. Confirm no performance regressions from factory pattern adoption

## Timeline

1. High Priority Files: Complete within 1-2 days
2. Medium Priority Files: Complete within 3-4 days
3. Low Priority Files: Complete within 5-7 days

## Rollback Plan

If issues occur, we can:
1. Revert changes for specific problematic files
2. Return to using direct node creation with legacy functions
3. Add additional compatibility layers if needed