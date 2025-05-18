# Type Restructure Project: Complete Context and Entrypoint

## 🎯 Project Goal
Unify AST and runtime types into a single coherent type system, eliminating artificial separation between parsing and execution types.

## 📍 Current Status
**Phase 5c: Directive Handlers** - PAUSED to implement test infrastructure update first.

## 🗂️ Key Reference Documents

### Primary Plan Documents
1. **`TYPE-RESTRUCTURE.md`** - Main project plan (currently on Step 5c)
2. **`UPDATE-TESTS-FIXTURES.md`** - Test infrastructure update plan (HIGH PRIORITY)
3. **`MIGRATION-TO-FIXTURES.md`** - Guide for migrating tests to fixture-based approach
4. **`FIXTURE-MIGRATION-TRACKER.md`** - Progress tracker for test migrations

### Supporting Documents
5. **`PLAN-CONTEXT.md`** - Current code structure and service dependencies
6. **`AST-NODE-DESIGN.md`** - Design for `BaseMeldNode` interface and `MeldNode` union
7. **`AST-BASE-INTERFACES.md`** - Canonical list of base interfaces and field mappings
8. **`STATE-AFFECTED-METHODS.md`** - StateService methods requiring updates
9. **`STATE-UPDATES.md`** - Detailed StateService migration plan
10. **`TYPE-RESTRUCTURE-CONTEXT.md`** - Implementation context from completed phases

## 🚧 Current Issue
Tests are creating incorrect node structures, causing handlers to be modified backward to accommodate tests instead of real AST structure.

**CRITICAL DISCOVERY**: The handlers themselves are using outdated AST structure with `node.directive` property. The actual AST has structure directly on the node (`node.kind`, `node.values`, etc.)

## 🔧 Immediate Next Steps

### 1. Update Handlers AND Tests Together (Week 3.5 - Revised Approach)
- [x] Create `ASTFixtureLoader` utility
- [x] Create migration guide and example
- [x] Discover handler issues via test migration
- [ ] Update handlers and tests together:
  - [x] TextDirectiveHandler (example complete)
  - [x] DataDirectiveHandler (complete - handler and tests updated)
  - [x] PathDirectiveHandler (complete - handler and tests updated)
  - [x] ImportDirectiveHandler (complete - handler and tests updated)
  - [x] AddDirectiveHandler (complete - handler and tests updated)
  - [ ] RunDirectiveHandler (update both)
  - [ ] ExecDirectiveHandler (update both)

### 2. Critical Handler Updates Required
All handlers need to be updated to use the actual AST structure:
- Remove all `node.directive` references
- Use `node.kind` instead of `node.directive.kind`
- Use `node.values` instead of `node.directive.values`
- Remove adapter layers from tests once handlers are fixed

## 📐 Technical Context

### AST Structure Evolution
```typescript
// Old structure (what tests incorrectly create):
{
  type: 'Directive',
  directive: {
    kind: 'text',
    identifier: 'greeting',
    value: 'Hello'
  }
}

// New structure (from fixtures/snapshots):
{
  type: 'Directive',
  kind: 'text',
  subtype: 'textAssignment',
  values: {
    identifier: [...],  // Array of nodes
    content: [...]      // Array of nodes
  },
  raw: {
    identifier: 'greeting',
    content: 'Hello'
  }
}
```

### Key Type Definitions
- **`MeldNode`** - Discriminated union of all node types
- **`BaseMeldNode`** - Base interface all nodes extend
- Located in `core/ast/types/`

### Import Path Changes
- Old: `@core/syntax/types`
- New: `@core/ast/types`

## 🛠️ Working Commands

### Building
```bash
npm run build
```

### Testing
```bash
npm test services           # Run all service tests
npm test <specific-file>    # Run specific test file
```

### AST Tools
```bash
npm run ast:process-all     # Generate fixtures/snapshots
npm run ast:validate        # Validate generated types
```

## 🔄 Project Workflow (Comprehensive Migration)

1. **Check Current Status**
   - Review `TYPE-RESTRUCTURE.md` Step 5c
   - Check `FIXTURE-MIGRATION-TRACKER.md`

2. **Complete Handler Migration**
   For each handler:
   - Create/update fixture-based tests
   - Update handler to use actual AST structure
   - Evaluate existing non-fixture tests
   - Delete redundant tests, update complementary ones
   - Remove all adapter layers
   - Ensure comprehensive test coverage

3. **Test Evaluation Process**
   - Compare old tests vs fixture tests
   - Identify which tests are redundant
   - Keep tests that provide additional coverage
   - Update kept tests to use correct AST structure
   - Remove all `node.directive` references

4. **Validate Progress**
   - Run all tests together
   - Ensure no adapter layers remain
   - Update progress in tracker
   - Move to next handler

## ⚠️ Critical Notes

1. **DO NOT** rely on test adapter layers - they mask the real problem
2. **DO** update handlers to use actual AST structure (no `node.directive`)
3. **Tests AND handlers must be updated together** for correctness
4. **Fixture-based testing** ensures we're testing against real AST
5. **Adapter layers = code smell** - indicates handler using wrong structure

## 📊 Progress Summary

### Completed
- ✅ Steps 1-4: Type analysis and union creation
- ✅ Step 5a: StateService migration
- ✅ Step 5b: InterpreterService update
- ✅ Test infrastructure design and tooling

### In Progress
- 🔄 Test migration to fixtures (HIGH PRIORITY)
- 🔄 Step 5c: Directive handler updates (PAUSED)

### Upcoming
- ⏳ Step 6: Remove legacy types
- ⏳ Step 7: Update all imports
- ⏳ Step 8: Documentation and validation

## 🎬 Getting Started in New Session

1. Read this file for context
2. Check `FIXTURE-MIGRATION-TRACKER.md` for current test migration status
3. Continue migrating tests following `MIGRATION-TO-FIXTURES.md`
4. Once tests are migrated, resume handler updates per `TYPE-RESTRUCTURE.md` Step 5c

## 🔗 Related Files Structure
```
_dev/
├── TYPE-RESTRUCTURE-ENTRYPOINT.md (THIS FILE)
├── TYPE-RESTRUCTURE.md
├── UPDATE-TESTS-FIXTURES.md
├── PLAN-CONTEXT.md
├── AST-NODE-DESIGN.md
├── AST-BASE-INTERFACES.md
├── STATE-AFFECTED-METHODS.md
├── STATE-UPDATES.md
└── TYPE-RESTRUCTURE-CONTEXT.md

services/
├── MIGRATION-TO-FIXTURES.md
├── FIXTURE-MIGRATION-TRACKER.md
└── pipeline/DirectiveService/handlers/definition/
    └── TextDirectiveHandler.fixture-test.ts (example)

tests/utils/
└── ASTFixtureLoader.ts

core/ast/
├── types/         # New unified types
└── fixtures/      # AST fixtures for testing
```

This context should provide everything needed to continue the work in a fresh session!