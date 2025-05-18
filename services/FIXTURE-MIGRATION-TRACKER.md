# Fixture Migration Tracker

## Overview

Tracking the migration of service tests from manual node creation to fixture-based testing.

**CRITICAL UPDATE**: We've discovered that the handlers themselves are using outdated AST structure. This tracker now includes both test migration AND handler updates to work with the actual AST.

### The Core Issue
- Handlers are expecting the old AST structure with `node.directive` property
- The actual AST has structure directly on the node (`node.kind`, `node.values`, etc.)
- Test adapter layers were created to convert new AST → old structure
- This masking prevented us from seeing that handlers need updates
- The solution: Update handlers AND tests together to use the correct AST structure

## Migration Status

| Handler | Status | Fixture Test File | Notes |
|---------|--------|------------------|-------|
| TextDirectiveHandler | ✅ Complete | `TextDirectiveHandler.fixture.test.ts` | Handler updated, tests deduplicated, fully migrated |
| DataDirectiveHandler | ✅ Complete | `DataDirectiveHandler.fixture.test.ts` | Handler updated, adapter layer removed, all tests migrated |
| PathDirectiveHandler | ✅ Complete | `PathDirectiveHandler.fixture.test.ts` | Handler updated, adapter layer removed, all tests migrated |
| ImportDirectiveHandler | ✅ Complete | `ImportDirectiveHandler.fixture.test.ts` | Handler updated, all tests migrated, removed deprecated importNamed |
| AddDirectiveHandler | ✅ Complete | `AddDirectiveHandler.fixture.test.ts` | Handler updated, tests migrated, header/underHeader aligned with AST |
| RunDirectiveHandler | 🟡 Not Started | - | Code/command/exec fixtures |
| ExecDirectiveHandler | 🟡 Not Started | - | Complex handler, may need custom fixtures |

### Status Legend
- ✅ Complete: Both handler and tests updated to use new AST structure
- 🔄 Test-Only: Tests migrated but use adapter layer; handler still needs update
- 🟡 Not Started: Neither tests nor handler updated

## Fixture Coverage

| Directive Type | Fixture Count | Subtypes Covered |
|---------------|---------------|------------------|
| text | 10 | assignment (4), template (6) |
| data | 10 | primitive (6), object (4), array (2) |
| path | 12 | assignment (12) - various path types |
| import | 8 | all (4), selected (4) |
| add | 6 | template (2), variable (3), section (1) |
| run | 6 | code (2), command (2), exec (2) |
| exec | 8 | code (4), command (1), reference (3) |

## Progress Metrics

- **Tests Migrated**: 6/7 (86%)
- **Handlers Updated**: 5/7 (71%) - TextDirectiveHandler, DataDirectiveHandler, PathDirectiveHandler, ImportDirectiveHandler, AddDirectiveHandler complete
- **Fixtures Utilized**: ~41/60 (68%)
- **Tests Converted**: 65/~150 (43%)
- **Adapter Layers**: 0 (All removed)

## Next Steps

### Phase 1: Comprehensive Migration (Current - Revised Approach)
For each handler, perform complete migration:

1. [x] TextDirectiveHandler (example complete)
2. [x] DataDirectiveHandler
   - [x] Update handler to use actual AST structure
   - [x] Remove adapter layer from fixture tests
   - [x] Evaluate and update non-fixture tests
   - [x] Delete redundant tests, keep complementary ones
3. [x] PathDirectiveHandler
   - [x] Update handler to use actual AST structure
   - [x] Remove adapter layer from fixture tests
   - [x] Evaluate and update non-fixture tests
   - [x] Delete redundant tests, keep complementary ones
4. [x] ImportDirectiveHandler
   - [x] Update handler to use actual AST structure
   - [x] Remove adapter layer from fixture tests
   - [x] Evaluate and update non-fixture tests
   - [x] Delete redundant tests, keep complementary ones (removed deprecated importNamed test)
5. [x] AddDirectiveHandler
   - [x] Create fixture-based tests
   - [x] Update handler to use actual AST structure
   - [x] Evaluate and update non-fixture tests
   - [x] Delete redundant tests, keep complementary ones
6. [ ] RunDirectiveHandler
   - [ ] Create fixture-based tests
   - [ ] Update handler to use actual AST structure
   - [ ] Evaluate and update non-fixture tests
   - [ ] Delete redundant tests, keep complementary ones
7. [ ] ExecDirectiveHandler
   - [ ] Create fixture-based tests
   - [ ] Update handler to use actual AST structure
   - [ ] Evaluate and update non-fixture tests
   - [ ] Delete redundant tests, keep complementary ones

### Phase 2: Final Cleanup
1. [ ] Verify all tests pass without adapter layers
2. [ ] Remove any remaining legacy test patterns
3. [ ] Update documentation

Next handler to migrate: AddDirectiveHandler

## Migration Guidelines (Updated)

**For comprehensive migration steps, see: [HANDLER-MIGRATION-CHECKLIST.md](./HANDLER-MIGRATION-CHECKLIST.md)**

### Quick Overview

1. **Update handler**: Remove `node.directive`, use actual AST structure
2. **Create fixture tests**: Use ASTFixtureLoader without adapters
3. **Review existing tests**: Delete duplicates, update keepers
4. **Validate coverage**: Ensure comprehensive testing
5. **Update tracking**: Mark complete in this tracker

### Key Principles

- **No adapter layers** - Tests should use actual AST structure
- **No redundant tests** - Delete tests that duplicate fixture coverage
- **Document kept tests** - Explain why non-fixture tests add value
- **Complete migration** - Both handler and ALL tests must be updated

### Test Deduplication

When reviewing existing tests:
1. Check if fixture covers the scenario
2. Delete if redundant
3. Keep and update if it adds unique value
4. Document why kept tests are valuable

### What Makes a Test Worth Keeping?

✅ Keep tests that:
- Cover complex error scenarios
- Test service integrations
- Handle edge cases with specific mocks
- Validate performance/timeouts

❌ Delete tests that:
- Duplicate basic fixture coverage
- Test simple input/output
- Only validate property access
- Are basic "happy path" tests

## Benefits Realized

- [ ] Reduced test maintenance
- [ ] Better test coverage
- [ ] Accurate AST expectations
- [ ] Easier debugging
- [ ] Automatic updates with grammar changes

## Notes

- Example migration in `TextDirectiveHandler.fixture.test.ts`
- Migration guide in `MIGRATION-TO-FIXTURES.md`
- ASTFixtureLoader utility available in `@tests/utils`
- Fixtures located in `core/ast/fixtures/`