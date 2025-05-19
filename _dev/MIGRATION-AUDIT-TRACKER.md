# Migration Verification Audit Tracker (Step 5.5)

## Purpose
Track the comprehensive audit of all services marked as "completed" to verify they meet full migration criteria.

## Audit Status Overview

| Service | Import Audit | AST Structure | Union Usage | Testing | Overall Status |
|---------|-------------|---------------|-------------|---------|---------------|
| StateService | ✅ | ✅ | ⚠️ | ❌ | **PARTIAL** |
| InterpreterService | ❌ | ❌ | ⚠️ | ❌ | **FAILED** |
| ParserService | ✅ | ✅ | ⚠️ | ⚠️ | **MOSTLY COMPLETE** |
| TextDirectiveHandler | ❌ | ✅ | ✅ | ✅ | **MOSTLY COMPLETE** |
| DataDirectiveHandler | ❌ | ✅ | ⚠️ | ✅ | **MOSTLY COMPLETE** |
| PathDirectiveHandler | ❌ | ✅ | ✅ | ✅ | **MOSTLY COMPLETE** |
| ImportDirectiveHandler | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| AddDirectiveHandler | ❌ | ✅ | ✅ | ✅ | **MOSTLY COMPLETE** |
| RunDirectiveHandler | ❌ | ✅ | ✅ | ✅ | **MOSTLY COMPLETE** |
| ExecDirectiveHandler | ✅ | ✅ | ⚠️ | ✅ | **MOSTLY COMPLETE** |

**Legend**: ✅ Complete | ⚠️ Issues Found | ❌ Failed | ⏳ Pending

## Audit Criteria Checklist

### 1. Type Imports Audit
- [ ] Main service file has NO `@core/syntax/types` imports
- [ ] Test files use `@core/ast/types` exclusively
- [ ] Supporting files (factories, utilities) updated
- [ ] No hidden references found via grep search

### 2. AST Structure Audit  
- [ ] NO `node.directive.*` property access
- [ ] Direct property access (`node.kind`, `node.values`)
- [ ] No adapter layers converting structures
- [ ] Correct raw content access patterns

### 3. Discriminated Union Usage
- [ ] Service uses `MeldNode` union type
- [ ] Proper type narrowing with switch/if
- [ ] Type guards used correctly
- [ ] No manual type assertions

### 4. Testing Audit
- [ ] Tests use fixtures from `core/ast/fixtures/`
- [ ] No hardcoded mock AST with wrong structure
- [ ] Tests validate against expected outputs
- [ ] Integration tests use real AST data

## Detailed Findings

### StateService
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ✅
- [x] Files checked: 
  - [x] StateService.ts
  - [x] StateService.test.ts
  - [x] IStateService.ts
  - [x] Supporting utilities (StateFactory.ts, types.ts)
- **Findings**: All files correctly use `@core/ast/types` and `@core/types`. NO imports from `@core/syntax/types` found.

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses direct property access. No usage of `node.directive.*` pattern.

#### Discriminated Union Usage ⚠️
- [x] MeldNode usage verified - Used in method signatures
- [x] Type narrowing patterns checked - Uses type checking but with assertions
- **Findings**: 
  - Uses MeldNode discriminated union in method signatures
  - Uses type checking (`node.type === 'Text'`) but follows with type assertions
  - No proper type guards defined
  - Could improve by using natural type narrowing without assertions

#### Testing Audit ❌
- [ ] Fixture usage verified - NOT using fixtures
- [x] Mock structures checked - Using incorrect mock structures
- **Findings**:
  - NOT using AST fixtures from `core/ast/fixtures/`
  - Hardcoded mock AST structures missing required fields (nodeId, location)
  - Tests focused on behavior rather than AST correctness
  - No integration tests with real AST data

**Overall Status**: **PARTIAL**
**Issues Found**: 
1. Testing not using fixture-based approach
2. Mock AST structures have wrong shape
3. Type narrowing could be improved (using assertions instead of guards)

**Recommended Actions**: 
1. Migrate tests to use `ASTFixtureLoader` and real fixtures
2. Fix mock AST structures to include all required fields
3. Replace type assertions with proper type guards
4. Add integration tests with real parsed AST data

---

### InterpreterService
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ❌
- [x] Files checked: 
  - [x] InterpreterService.ts
  - [x] InterpreterService.test.ts
  - [x] IInterpreterService.ts
  - [x] Supporting utilities (testFactories.ts)
- **Findings**: 
  - InterpreterService.ts has ONE old import: `import type { SourceLocation, InterpolatableValue } from '@core/syntax/types/nodes';`
  - Test files use old helper: `createNodeFromExample()` from `@core/syntax/helpers/index`

#### AST Structure Audit ❌
- [x] Property access patterns checked
- [x] Found `node.directive` usage
- **Findings**: 
  - Several instances of `node.directive.kind` in commented-out debug logs
  - Active usage in logging: `(node as DirectiveNode).directive?.kind`
  - Should be updated to `(node as DirectiveNode).kind`

#### Discriminated Union Usage ⚠️
- [x] MeldNode usage verified - Used correctly in method signatures
- [x] Type narrowing patterns checked - Uses switch but with assertions
- **Findings**: 
  - Uses MeldNode[] in method signatures correctly
  - Has switch statement on `node.type` for discrimination
  - But uses manual type assertions (`as TextNode`, `as DirectiveNode`) after switching
  - Redundant type check inside switch case
  - Not using available type guards from `@core/types/nodes/guards.ts`

#### Testing Audit ❌
- [ ] Fixture usage verified - NOT using fixtures
- [x] Mock structures checked - Using manual factories
- **Findings**:
  - NOT using AST fixtures from `core/ast/fixtures/`
  - Uses `createNodeFromExample()` from old syntax helpers
  - Manual node creation via `testFactories.ts`
  - Mixed approach: some parsing, some manual creation
  - Tests validate behavior but not AST structure

**Overall Status**: **FAILED**
**Issues Found**: 
1. Still has import from `@core/syntax/types/nodes`
2. Uses `node.directive.kind` pattern in code
3. Not using proper type guards, relies on assertions
4. Testing uses old syntax helpers and manual factories

**Recommended Actions**: 
1. Update import to use `@core/ast/types` for SourceLocation
2. Replace `node.directive.kind` with `node.kind`
3. Remove type assertions, use type guards properly
4. Migrate tests to use AST fixtures
5. Remove dependency on old syntax helpers

---

### ParserService
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ✅
- [x] Files checked: 
  - [x] ParserService.ts
  - [x] ParserService.test.ts
  - [x] IParserService.ts
  - [x] transformations.ts
- **Findings**: All files correctly use `@core/ast/types` and `@core/types`. NO imports from `@core/syntax/types` found.

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses direct property access. No usage of `node.directive.*` pattern.

#### Discriminated Union Usage ⚠️
- [x] MeldNode usage verified - Used correctly in method signatures
- [x] Type narrowing patterns checked - Limited usage
- **Findings**: 
  - Returns MeldNode[] from all parse methods
  - Limited type narrowing (only for CodeFence nodes)
  - Imports but doesn't use `isVariableReferenceNode` guard
  - Uses type assertions (`as CodeFenceNode`) instead of guards
  - No comprehensive switch/if for all node types

#### Testing Audit ⚠️
- [ ] Fixture usage verified - NOT using core/ast/fixtures
- [x] Mock structures checked - Correct shape
- **Findings**:
  - Uses syntax examples from `@core/syntax/index` instead of fixtures
  - Manually constructs expected results
  - Mock AST structures have correct shape with all required fields
  - Tests validate the parsing pipeline with real parser

**Overall Status**: **MOSTLY COMPLETE**
**Issues Found**: 
1. Limited use of discriminated union features
2. Could use type guards instead of assertions
3. Tests don't use fixture files from core/ast/fixtures

**Recommended Actions**: 
1. Replace type assertions with proper type guards
2. Migrate tests to use AST fixtures
3. Implement more comprehensive type narrowing

---

### TextDirectiveHandler
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ❌
- [x] Files checked: 
  - [x] TextDirectiveHandler.ts
  - [x] TextDirectiveHandler.test.ts
  - [x] TextDirectiveHandler.fixture.test.ts
- **Findings**: 
  - Still imports from `@core/syntax/types/nodes`: `InterpolatableValue`, `StructuredPath`
  - Still imports from `@core/syntax/types/directives`: `DirectiveKind`

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses direct property access (`node.raw.identifier`, `node.values`, `node.location`)

#### Discriminated Union Usage ✅
- [x] MeldNode usage verified - Imports but doesn't use
- [x] Type narrowing patterns checked - N/A
- **Findings**: 
  - Imports MeldNode but doesn't use it (acceptable)
  - Works with specific DirectiveNode type, not generic MeldNode
  - No discriminated union patterns needed for handler

#### Testing Audit ✅
- [x] Fixture usage verified - Has fixture-based tests
- [x] Mock structures checked - Both approaches present
- **Findings**:
  - Has both manual mock tests and fixture-based tests
  - TextDirectiveHandler.fixture.test.ts uses ASTFixtureLoader
  - Multiple fixture test files for different scenarios
  - Uses fixtures like `text-assignment-1`, `text-template-1`

**Overall Status**: **MOSTLY COMPLETE**
**Issues Found**: 
1. Still has imports from `@core/syntax/types`

**Recommended Actions**: 
1. Replace old type imports:
   - InterpolatableValue → use types from `@core/ast/types`
   - StructuredPath → use types from `@core/ast/types`
   - DirectiveKind → use from `@core/ast/types`

---

### DataDirectiveHandler
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ❌
- [x] Files checked: 
  - [x] DataDirectiveHandler.ts
  - [x] DataDirectiveHandler.test.ts
  - [x] DataDirectiveHandler.fixture.test.ts
- **Findings**: 
  - Imports from `@core/syntax/types/nodes`: `DirectiveNode`, `InterpolatableValue`, `VariableReferenceNode`, `TextNode`, `StructuredPath`
  - Also imports from `@core/ast/types/guards` (mixed usage)

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses `node.values.*` pattern, not deprecated `node.directive.*`

#### Discriminated Union Usage ⚠️
- [x] MeldNode usage verified - Not used
- [x] Type guards checked - Uses isInterpolatableValueArray
- **Findings**: 
  - Does not use MeldNode discriminated union
  - Uses type guards from AST (`isInterpolatableValueArray`)
  - Performs direct kind checking (`node.kind !== 'data'`)

#### Testing Audit ✅
- [x] Fixture usage verified - Has fixture-based tests
- [x] Mock structures checked - Both approaches present
- **Findings**:
  - Has both manual mock tests and fixture-based tests
  - DataDirectiveHandler.fixture.test.ts uses ASTFixtureLoader
  - Manual tests use createDirectiveNode factory

**Overall Status**: **MOSTLY COMPLETE**
**Issues Found**: 
1. Still has imports from `@core/syntax/types/nodes`
2. Mixed import sources (both old and new)

**Recommended Actions**: 
1. Replace all imports from `@core/syntax/types` with `@core/ast/types`
2. Ensure consistent use of new type system

---

### PathDirectiveHandler
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ❌
- [x] Files checked: 
  - [x] PathDirectiveHandler.ts
  - [x] PathDirectiveHandler.test.ts
  - [x] PathDirectiveHandler.fixture.test.ts
- **Findings**: 
  - Imports from `@core/syntax/types/index`: `DirectiveNode`, `DirectiveData`
  - Imports from `@core/syntax/types/directives`: `PathDirectiveData`
  - Imports from `@core/syntax/types/nodes`: `StructuredPath`

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses `node.values` and `node.kind` patterns

#### Discriminated Union Usage ✅
- [x] MeldNode usage verified - Not used
- [x] Type narrowing patterns checked - Basic kind checking
- **Findings**: 
  - Does not use MeldNode discriminated union
  - Uses direct node type casting and kind checking
  - No need for discriminated union in this handler

#### Testing Audit ✅
- [x] Fixture usage verified - Has fixture-based tests
- [x] Mock structures checked - Both approaches present
- **Findings**:
  - Has both manual mock tests and fixture-based tests
  - PathDirectiveHandler.fixture.test.ts uses ASTFixtureLoader
  - Manual tests use createDirectiveNode factory
  - Both test files use proper DI container pattern

**Overall Status**: **MOSTLY COMPLETE**
**Issues Found**: 
1. Still has imports from `@core/syntax/types`

**Recommended Actions**: 
1. Replace all imports from `@core/syntax/types` with `@core/ast/types`
2. Update DirectiveNode, DirectiveData, PathDirectiveData, StructuredPath imports

---

### ImportDirectiveHandler
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ✅
- [x] Files checked: 
  - [x] ImportDirectiveHandler.ts
  - [x] ImportDirectiveHandler.test.ts
  - [x] ImportDirectiveHandler.fixture.test.ts
- **Findings**: All imports use `@core/ast/types` and `@core/types`. NO imports from `@core/syntax/types` found.

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses `node.values`, `node.kind`, and `node.subtype` patterns

#### Discriminated Union Usage ✅
- [x] MeldNode usage verified - Imports but minimal use
- [x] Type narrowing patterns checked - Basic kind checking
- **Findings**: 
  - Imports MeldNode but uses specific DirectiveNode types
  - Uses type guards for node kind checking
  - Uses type narrowing for path node processing

#### Testing Audit ✅
- [x] Fixture usage verified - Has fixture-based tests
- [x] Mock structures checked - Multiple test files
- **Findings**:
  - ImportDirectiveHandler.fixture.test.ts uses ASTFixtureLoader
  - ImportDirectiveHandler.test.ts uses manual mocks
  - ImportDirectiveHandler.transformation.test.ts tests transformations
  - Good coverage with both approaches

**Overall Status**: **COMPLETE** ✅
**Issues Found**: None

**Recommended Actions**: None - handler is fully migrated

---

### AddDirectiveHandler
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ❌
- [x] Files checked: 
  - [x] AddDirectiveHandler.ts
  - [x] AddDirectiveHandler.test.ts
  - [x] AddDirectiveHandler.fixture.test.ts
- **Findings**: 
  - Still imports `TextNode` from `@core/syntax/types/nodes`
  - Most imports are from `@core/ast/types` (DirectiveNode, MeldNode)
  - Mixed usage of old and new types

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses flattened structure (`node.kind`, `node.subtype`, `node.values`)

#### Discriminated Union Usage ✅
- [x] MeldNode usage verified - Imports and uses
- [x] Type narrowing patterns checked - Uses kind checking
- **Findings**: 
  - Uses discriminated union pattern with node.kind checking
  - Switches on node.subtype for variant handling
  - No formal type guards used

#### Testing Audit ✅
- [x] Fixture usage verified - Has fixture-based tests
- [x] Mock structures checked - Both approaches present
- **Findings**:
  - AddDirectiveHandler.fixture.test.ts uses ASTFixtureLoader
  - Main test file uses manual mocks with vitest-mock-extended
  - Some fixture tests commented out due to grammar bugs

**Overall Status**: **MOSTLY COMPLETE**
**Issues Found**: 
1. Still imports `TextNode` from `@core/syntax/types/nodes`

**Recommended Actions**: 
1. Replace TextNode import with `@core/ast/types`
2. Remove all remaining old type imports

---

### RunDirectiveHandler
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ❌
- [x] Files checked: 
  - [x] RunDirectiveHandler.ts
  - [x] Test files (multiple variants)
- **Findings**: 
  - Most imports from `@core/ast/types`
  - Still imports from `@core/syntax/types/guards`: `isInterpolatableValueArray`
  - Mixed usage of old and new types

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses `node.subtype`, `node.values`, `node.raw` patterns

#### Discriminated Union Usage ✅
- [x] MeldNode usage verified - Imports and uses
- [x] Type narrowing patterns checked - Uses node.kind checking
- **Findings**: 
  - Imports MeldNode and specific node types
  - Uses kind checking (`node.kind !== 'run'`)
  - Uses subtype switching for different run variants
  - Direct type checks on value nodes

#### Testing Audit ✅
- [x] Fixture usage verified - Has fixture-based tests
- [x] Mock structures checked - Multiple test files
- **Findings**:
  - RunDirectiveHandler.fixture.test.ts uses ASTFixtureLoader
  - RunDirectiveHandler.test.ts uses manual mocks
  - RunDirectiveHandler.simplified.test.ts for simplified tests
  - RunDirectiveHandler.transformation.test.ts for transformations
  - Comprehensive test coverage

**Overall Status**: **MOSTLY COMPLETE**
**Issues Found**: 
1. Still imports `isInterpolatableValueArray` from `@core/syntax/types/guards`

**Recommended Actions**: 
1. Replace guard import with `@core/ast/types/guards`
2. Remove remaining old type imports

---

### ExecDirectiveHandler
**Date Audited**: 2024-01-20
**Auditor**: Claude

#### Import Audit ✅
- [x] Files checked: 
  - [x] ExecDirectiveHandler.ts
  - [x] ExecDirectiveHandler.fixture.test.ts
- **Findings**: All imports use new types from `@core/ast/types` and `@core/types`. NO imports from `@core/syntax/types`.

#### AST Structure Audit ✅
- [x] Property access patterns checked
- [x] No `node.directive` found
- **Findings**: Correctly uses direct property access (`node.values`, `node.raw`, `node.meta`)

#### Discriminated Union Usage ⚠️
- [x] MeldNode usage verified - Not used
- [x] Type narrowing patterns checked - Manual checking
- **Findings**: 
  - Imports specific node types (ExecDirectiveNode, RunDirectiveNode)
  - Uses manual kind checking (`node.kind !== 'exec'`)
  - Does not use type guard functions
  - Directly casts nodes

#### Testing Audit ✅
- [x] Fixture usage verified - Uses fixtures
- [x] Mock structures checked - Fixture-based
- **Findings**:
  - Uses ASTFixtureLoader
  - Attempts to load fixtures (with fallback to mocks)
  - Mocks services but uses fixtures for nodes

**Overall Status**: **MOSTLY COMPLETE**
**Issues Found**: 
1. Could use type guards from exec.ts instead of manual checking

**Recommended Actions**: 
1. Consider using type guard functions
2. Could leverage MeldNode union for better type safety

---

## Summary of Issues Found

### Critical Issues
1. **InterpreterService** - Still using old imports and `node.directive.kind` pattern
2. **Multiple handlers** - Still importing from `@core/syntax/types`

### High Priority Issues
1. **StateService** - Tests not using fixtures, mock AST structures incorrect
2. **InterpreterService** - Uses manual type assertions instead of type guards
3. **Most services** - Not fully utilizing discriminated union patterns

### Medium Priority Issues
1. **Type imports** - 6 out of 10 services still have old import paths
2. **Testing inconsistency** - Mix of fixture-based and manual mock approaches
3. **Type guard usage** - Most services not using available type guards

### Low Priority Issues
1. **Documentation** - Need to update service documentation
2. **Code cleanup** - Remove commented test code
3. **Type narrowing** - Could be improved in several services

## Next Steps

1. ✅ Complete audit for all services
2. Fix critical issues first (InterpreterService)
3. Update all remaining old imports
4. Standardize testing approach across services
5. Update TYPE-RESTRUCTURE.md with accurate status

## Audit Progress

- **Started**: 2024-01-20
- **Last Updated**: 2024-01-20
- **Services Audited**: 10/10 ✅
- **Issues Found**: 
  - Import issues: 7 services
  - AST structure issues: 1 service
  - Testing issues: 8 services
  - Union usage issues: 7 services
- **Completion**: DONE

## Mitigation Strategy

1. **Update all imports** from `@core/syntax/types` to `@core/ast/types`
2. **Fix AST structure access** - InterpreterService needs significant refactoring
3. **Standardize testing approach** - Many services still use old AST patterns
4. **Update union type usage** - Ensure proper use of discriminated unions
5. **Consistent fixture usage** - Use AST fixtures consistently across all tests

### Testing Standards Note
As documented in `docs/dev/TESTS.md#ast-fixtures-vs-service-mocks`:
- AST fixtures should be used for node structures (not manual construction)
- Service dependencies should still be mocked in tests  
- Fixtures complement mocks - they serve different purposes
- When migrating tests: replace manual node construction with fixture loading but keep service mocks

## Implementation Priorities and Order

### Priority 1: Critical Issues
Must be fixed first as they block other work:
1. **InterpreterService** - Fix old imports and `node.directive.kind` pattern
2. **StateService** - Fix tests to use fixtures and correct mock structures

### Priority 2: Import Updates
Update all services with old imports:
1. TextDirectiveHandler - Replace `InterpolatableValue`, `StructuredPath`, `DirectiveKind`
2. DataDirectiveHandler - Replace all `@core/syntax/types/nodes` imports
3. PathDirectiveHandler - Replace all `@core/syntax/types` imports  
4. AddDirectiveHandler - Replace `TextNode` import
5. RunDirectiveHandler - Replace `isInterpolatableValueArray` guard import
6. ResolutionService - Check and update supporting files
7. PathService - Fix one remaining test import

### Priority 3: Testing Standardization
1. Update all services to use `ASTFixtureLoader`
2. Remove manual AST node construction
3. Ensure mock structures include all required fields (nodeId, location)
4. Add integration tests with real parsed AST data

### Priority 4: Type Improvements
1. Implement proper type guards (replace type assertions)
2. Use discriminated union patterns consistently
3. Update services to leverage MeldNode union type safety

## Implementation Decisions

### Node Property Access
- ✅ Use `node.kind` (NOT `node.directive.kind`)
- ✅ Use `node.values` (NOT `node.directive.values`)
- ✅ Use `node.raw` for raw content
- ✅ Use `node.metadata` for additional attributes

### Type Import Sources
- ✅ Import from `@core/ast/types/*` for AST node types
- ✅ Import from `@core/types/*` for general system types
- ❌ Never import from `@core/syntax/types` (legacy)
- ❌ Never import from `@core/syntax/types-old` (transitional)

### Testing Approach
- ✅ Load fixtures using `ASTFixtureLoader`
- ✅ Use fixtures from `core/ast/fixtures/*.json`
- ✅ Mock service dependencies with vi.fn()
- ❌ Don't create AST nodes manually
- ❌ Don't use mock<T>() for nodes

### Type Guards and Narrowing
- ✅ Use type guards from `@core/ast/types/guards`
- ✅ Use switch on `node.type` for discrimination
- ✅ Use if with type guards for specific checks
- ❌ Avoid manual type assertions (as NodeType)

## Completion Checklist Template

For each service/handler migration:

### [ ] Service: _______________

#### Import Updates
- [ ] Main file imports from `@core/ast/types`
- [ ] Test files import from `@core/ast/types`
- [ ] Supporting files updated (factories, utilities)
- [ ] No old imports remain (grep verified)

#### AST Structure
- [ ] Uses `node.kind` not `node.directive.kind`
- [ ] Uses `node.values` not `node.directive.values`
- [ ] Direct property access pattern
- [ ] No adapter/conversion layers

#### Type System
- [ ] Uses MeldNode union where appropriate
- [ ] Type guards instead of assertions
- [ ] Proper type narrowing with switch/if
- [ ] No manual type casting

#### Testing
- [ ] Uses ASTFixtureLoader for nodes
- [ ] Fixtures from core/ast/fixtures/
- [ ] Mock structures have nodeId + location
- [ ] Integration tests with real AST
- [ ] All tests passing

#### Documentation
- [ ] Service documentation updated
- [ ] Type documentation accurate
- [ ] Code comments reflect new structure
- [ ] No TODO/FIXME for old types

## Common Patterns and Solutions

### Pattern: Loading AST Fixtures
```typescript
// GOOD
const node = await ASTFixtureLoader.loadNode('text', 'assignment');

// BAD  
const node = {
  type: 'TextAssignment',
  directive: { kind: 'text', type: 'assignment' }
  // manual construction
};
```

### Pattern: Type Narrowing
```typescript
// GOOD - Using type guard
if (isTextNode(node)) {
  console.log(node.content);
}

// GOOD - Using switch
switch (node.type) {
  case 'Text':
    console.log(node.content);
    break;
}

// BAD - Manual assertion
const textNode = node as TextNode;
console.log(textNode.content);
```

### Pattern: Service Mocking
```typescript
// GOOD - Mock service, use fixture for node
const mockStateService = {
  get: vi.fn(),
  set: vi.fn()
} as unknown as IStateService;

const node = await ASTFixtureLoader.loadNode('run', 'command');

// BAD - Manually creating both
const mockNode = { type: 'Run', ... };
```

## Validation Steps

After completing migration for each service:
1. Run service tests: `npm test services/[service-name]`
2. Run type check: `npm run typecheck`
3. Check for console warnings about deprecated imports
4. Verify no remaining old imports: `grep -r "@core/syntax/types" services/[service-name]`
5. Run integration tests with real Meld files

## Resources

- **Type Design**: See `AST-NODE-DESIGN.md` for MeldNode union design
- **Implementation Plan**: See `TYPE-RESTRUCTURE.md` for overall project plan
- **Type Structure**: See `AST-TYPES-CLEANUP.md` for final type organization
- **Testing Standards**: See `docs/dev/TESTS.md#ast-fixtures-vs-service-mocks`