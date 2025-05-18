# Fixture Migration Tracker

## Overview

Tracking the migration of service tests from manual node creation to fixture-based testing.

## Migration Status

| Handler | Status | Fixture Test File | Notes |
|---------|--------|------------------|-------|
| TextDirectiveHandler | ✅ Example Created | `TextDirectiveHandler.fixture.test.ts` | Example migration complete |
| DataDirectiveHandler | ✅ Complete | `DataDirectiveHandler.fixture.test.ts` | All 11 tests passing with fixtures |
| PathDirectiveHandler | ✅ Complete | `PathDirectiveHandler.fixture.test.ts` | All 8 tests passing with fixtures |
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

- **Handlers Migrated**: 2/7 (29%)
- **Fixtures Utilized**: ~14/60 (23%)
- **Tests Converted**: 19/~150 (13%)

## Next Steps

1. [x] Migrate DataDirectiveHandler (simplest after Text)
2. [x] Migrate PathDirectiveHandler
3. [ ] Migrate ImportDirectiveHandler (next in complexity)
4. [ ] Continue with AddDirectiveHandler
5. [ ] Complete RunDirectiveHandler and ExecDirectiveHandler

Next handler to migrate: ImportDirectiveHandler

## Migration Guidelines

For each handler migration:

1. **Create companion test file**: `[Handler].fixture.test.ts`
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

- Example migration in `TextDirectiveHandler.fixture.test.ts`
- Migration guide in `MIGRATION-TO-FIXTURES.md`
- ASTFixtureLoader utility available in `@tests/utils`
- Fixtures located in `core/ast/fixtures/`