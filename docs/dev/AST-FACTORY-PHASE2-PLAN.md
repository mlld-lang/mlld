# AST Factory Pattern Implementation - Phase 2 Plan

## Overview

Phase 1 of the AST factory pattern implementation successfully established:
- Interface segregation with a clear hierarchy
- Factory implementations for all AST node types
- DI container registration for factory classes
- Backward compatibility layer through legacy functions

Phase 2 will focus on migrating client code to use the factory pattern directly. This document outlines the implementation plan for Phase 2.

## Goals

1. Update client code that creates AST nodes to use factories directly
2. Reduce reliance on the legacy compatibility layer
3. Maintain backward compatibility for external APIs
4. Improve testability and maintainability
5. Complete the circular dependency resolution effort

## Implementation Steps

### 1. Identify Target Files

Client code using legacy AST node creation functions:

- `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts`
- `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts`
- `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.edge.test.ts`
- `tests/parent-object-reference.test.ts`
- Additional files using direct node creation (to be identified)

### 2. Update VariableReferenceResolver Implementation

- Inject `VariableNodeFactory` via DI
- Replace legacy function calls with factory method calls
- Maintain behavior compatibility
- Update tests to verify equivalent behavior

### 3. Update Test Files

- Modify test files to use factory pattern
- Ensure all tests pass with the new implementation
- Add specific tests for factory usage
- Verify factory pattern resolves circular dependencies

### 4. Document Factory Pattern Usage

- Add examples of correct factory usage in code comments
- Update relevant documentation files
- Create migration guide for future updates

### 5. Validate Implementation

- Comprehensive test coverage for all changes
- Verify circular dependencies are resolved
- Performance testing
- Backward compatibility validation

## Detailed Implementation Plan for VariableReferenceResolver

### Current Usage (Legacy)

```typescript
import { createVariableReferenceNode, isVariableReferenceNode } from '@core/syntax/types/variables.js';

// Creating a node
const node = createVariableReferenceNode(baseName, valueType, fields);

// Checking node type
if (isVariableReferenceNode(node)) {
  // process node
}
```

### Target Implementation (Factory Pattern)

```typescript
import { VariableNodeFactory } from '@core/syntax/types/factories/index.js';
import { IVariableReference } from '@core/syntax/types/interfaces/index.js';

// Inject via constructor
constructor(
  private readonly stateService: IStateService,
  private readonly resolutionService?: IResolutionService,
  private readonly parserService?: IParserService,
  @inject(VariableNodeFactory) private readonly variableNodeFactory: VariableNodeFactory
) {}

// Creating a node
const node = this.variableNodeFactory.createVariableReferenceNode(baseName, valueType, fields);

// Checking node type
if (this.variableNodeFactory.isVariableReferenceNode(node)) {
  // process node
}
```

## Migration Strategy

1. Incremental updates, one class at a time
2. Update tests immediately after implementation changes
3. Run full test suite after each significant change
4. Keep legacy functions as fallback during transition
5. Establish pattern for new code to always use factories directly

## Success Criteria

- [ ] All identified target files successfully migrated to use factory pattern
- [ ] All tests passing with new implementation
- [ ] No direct node creation without factories in updated code
- [ ] Circular dependencies remain resolved
- [ ] Documentation updated to reflect factory usage

## Estimated Timeline

1. Initial updates to VariableReferenceResolver: 1 day
2. Test updates and validation: 1 day
3. Updates to remaining client code: 1-2 days
4. Final testing and documentation: 1 day

Total estimated time: 3-5 days

## Next Steps After Phase 2

1. Phase 3: Complete removal of legacy compatibility layer (future work)
2. Extend factory pattern to other areas of the codebase
3. Consider further refactoring opportunities enabled by factory pattern