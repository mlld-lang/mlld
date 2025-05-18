# Fixture Migration Tracker

## Overview

Tracking the migration of service tests from manual node creation to fixture-based testing.

## Migration Status

| Handler | Status | Fixture Test File | Notes |
|---------|--------|------------------|-------|
| TextDirectiveHandler | ✅ Example Created | `TextDirectiveHandler.fixture-test.ts` | Example migration complete |
| DataDirectiveHandler | 🟡 Not Started | - | Multiple fixture types available |
| PathDirectiveHandler | 🟡 Not Started | - | Path fixtures ready |
| ImportDirectiveHandler | 🟡 Not Started | - | Import all/selected fixtures |
| AddDirectiveHandler | 🟡 Not Started | - | Template/variable/section fixtures |
| RunDirectiveHandler | 🟡 Not Started | - | Code/command/exec fixtures |
| ExecDirectiveHandler | 🟡 Not Started | - | Complex handler, may need custom fixtures |

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

- **Handlers Migrated**: 0/7 (0%)
- **Fixtures Utilized**: 0/60 (0%)
- **Tests Converted**: 0/~150 (0%)

## Next Steps

1. [ ] Migrate DataDirectiveHandler (simplest after Text)
2. [ ] Create fixture test alongside existing tests
3. [ ] Verify all data fixtures are covered
4. [ ] Deprecate old test approach for this handler
5. [ ] Update progress metrics

## Migration Guidelines

For each handler migration:

1. **Create companion test file**: `[Handler].fixture-test.ts`
2. **Use ASTFixtureLoader**: Load appropriate fixtures
3. **Map fixtures to test cases**: Ensure coverage
4. **Keep both versions temporarily**: Run in parallel
5. **Deprecate old version**: Once confidence is high
6. **Update this tracker**: Mark as complete

## Benefits Realized

- [ ] Reduced test maintenance
- [ ] Better test coverage
- [ ] Accurate AST expectations
- [ ] Easier debugging
- [ ] Automatic updates with grammar changes

## Notes

- Example migration in `TextDirectiveHandler.fixture-test.ts`
- Migration guide in `MIGRATION-TO-FIXTURES.md`
- ASTFixtureLoader utility available in `@tests/utils`
- Fixtures located in `core/ast/fixtures/`