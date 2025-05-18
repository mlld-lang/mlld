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

## 🔧 Immediate Next Steps

### 1. Complete Test Infrastructure Update (Week 3.5)
- [x] Create `ASTFixtureLoader` utility
- [x] Create migration guide and example
- [ ] Migrate handler tests to use fixtures:
  - [x] TextDirectiveHandler (example complete)
  - [ ] DataDirectiveHandler
  - [ ] PathDirectiveHandler
  - [ ] ImportDirectiveHandler
  - [ ] AddDirectiveHandler
  - [ ] RunDirectiveHandler
  - [ ] ExecDirectiveHandler

### 2. Resume Directive Handler Updates (Step 5c)
Once tests are using correct AST structures:
- Fix handlers to work with new unified types
- Remove backward compatibility code
- Ensure proper use of `MeldNode` union type

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

## 🔄 Project Workflow

1. **Check Current Status**
   - Review `TYPE-RESTRUCTURE.md` Step 5c
   - Check `FIXTURE-MIGRATION-TRACKER.md`

2. **Work on Test Migration**
   - Follow `MIGRATION-TO-FIXTURES.md` guide
   - Use `TextDirectiveHandler.fixture-test.ts` as example
   - Update tracker after each migration

3. **Update Handlers**
   - Once tests are migrated, fix handler code
   - Remove old structure support
   - Use new `MeldNode` union properly

4. **Validate Progress**
   - Run tests to ensure correctness
   - Update progress in tracker
   - Move to next handler

## ⚠️ Critical Notes

1. **DO NOT** modify handlers to accommodate incorrect test structures
2. **DO** use fixtures as source of truth for AST structure
3. **Tests drive handler implementation is BACKWARD** - handlers should drive tests
4. **Fixture-based testing** ensures correctness and maintainability

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