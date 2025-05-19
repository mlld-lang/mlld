# Test Deduplication Audit Tracker

## Purpose
Track the comprehensive audit of all service tests to identify duplicates between `.test.ts` and `.fixture.test.ts` files, and determine which tests need fixture migration.

## Audit Process
For each service/handler:
1. Read `.fixture.test.ts` file to understand coverage
2. Review each test in `.test.ts` file
3. Categorize each test as:
   - **Duplicate** - Functionality already covered by fixture tests (remove)
   - **Unique/Keep** - Tests service-specific behavior not covered by fixtures
   - **Needs Migration** - Unique test that should use fixtures

## Audit Status Overview

| Service/Handler | .test.ts Tests | Fixture Tests | Duplicates | Keep | Needs Migration | Status |
|-----------------|----------------|---------------|------------|------|-----------------|--------|
| TextDirectiveHandler | TBD | TBD | - | - | - | 🟡 Not Started |
| DataDirectiveHandler | TBD | TBD | - | - | - | 🟡 Not Started |
| PathDirectiveHandler | TBD | TBD | - | - | - | 🟡 Not Started |
| ImportDirectiveHandler | TBD | TBD | - | - | - | 🟡 Not Started |
| AddDirectiveHandler | TBD | TBD | - | - | - | 🟡 Not Started |
| RunDirectiveHandler | TBD | TBD | - | - | - | 🟡 Not Started |
| ExecDirectiveHandler | N/A | TBD | - | - | - | 🟡 Not Started |
| StateService | TBD | N/A | - | - | - | 🟡 Not Started |
| InterpreterService | TBD | N/A | - | - | - | 🟡 Not Started |
| ResolutionService | TBD | TBD | - | - | - | 🟡 Not Started |
| ParserService | TBD | TBD | - | - | - | 🟡 Not Started |

**Legend**: ✅ Complete | 🟡 Not Started | 🔴 Issues Found | N/A Not Applicable

## Detailed Findings

### TextDirectiveHandler
**Date Audited**: 5/19/2025
**Fixture Test File**: `TextDirectiveHandler.fixture.test.ts`
**Manual Test File**: `TextDirectiveHandler.test.ts`

#### Fixture Test Coverage
- ✅ Simple text assignments with string literals (text-assignment fixtures)
- ✅ Template literals with variable interpolation (text-template fixtures)
- ✅ Multiline templates (text-template-multiline fixtures)
- ✅ Error handling for undefined variables
- ✅ Comprehensive coverage via getFixturesByKind/getFixturesByKindAndSubtype methods

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| should handle a simple text assignment with string literal | Duplicate | Remove | Covered by text-assignment fixtures |
| should handle text assignment with escaped characters | Unique | Keep | Tests specific escape sequences (\n, \t, \") not in fixtures |
| should handle a template literal in text directive | Needs Migration | Migrate | Could use text-template fixtures |
| should handle object property interpolation in text value | Needs Migration | Migrate | Tests field access, could use fixtures with object vars |
| should handle path referencing in text values | Unique | Keep | Tests specific path variable resolution logic |
| should throw DirectiveError if text interpolation contains undefined variables | Unique | Keep | Tests error propagation and mock behavior |
| should handle basic variable interpolation | Duplicate | Remove | Covered by text-template fixtures |

#### Summary
- Tests to remove: 2
  - "should handle a simple text assignment with string literal"
  - "should handle basic variable interpolation"
- Tests to keep as-is: 3
  - "should handle text assignment with escaped characters"
  - "should handle path referencing in text values"
  - "should throw DirectiveError if text interpolation contains undefined variables"
- Tests to migrate to fixtures: 2
  - "should handle a template literal in text directive"
  - "should handle object property interpolation in text value"

---

### DataDirectiveHandler
**Date Audited**: [Pending]
**Fixture Test File**: `DataDirectiveHandler.fixture.test.ts`
**Manual Test File**: `DataDirectiveHandler.test.ts`

#### Fixture Test Coverage
- [ ] List all test scenarios covered by fixtures

#### Manual Test Analysis
| Test Name | Category | Action | Notes |
|-----------|----------|---------|--------|
| test-name | Duplicate/Unique/Needs Migration | Remove/Keep/Migrate | Additional notes |

#### Summary
- Tests to remove: []
- Tests to keep as-is: []
- Tests to migrate to fixtures: []

---

## Migration Priority

Based on the audit findings, prioritize migration in this order:
1. [To be determined after audit]
2. [To be determined after audit]
3. [To be determined after audit]

## Success Metrics

### Before Audit
- Total test files: [Count]
- Total test cases: [Count]
- Duplicate test coverage: [Unknown]

### After Audit (Target)
- Test files consolidated: [Target count]
- Test cases after deduplication: [Target count]
- Tests using fixtures: [Target %]

## Implementation Guidelines

### When to Keep Manual Tests
- Tests that mock specific error conditions
- Tests that verify service-specific behavior
- Tests that check edge cases not covered by fixtures
- Unit tests for internal helper methods

### When to Use Fixtures
- Tests that validate AST node processing
- Tests that check directive handling
- Integration tests
- Tests that need real AST structures

### Migration Process
1. Identify appropriate fixture from `core/ast/fixtures/`
2. Replace manual node construction with fixture loading
3. Update assertions to match fixture structure
4. Verify test still validates intended behavior
5. Remove any resulting duplicate tests

## Notes
- Fixture tests should cover general AST processing behavior
- Manual tests should focus on service-specific edge cases
- Keep service dependency mocking separate from AST fixtures
- Document why specific tests are kept as manual tests