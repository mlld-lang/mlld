# meld-ast Regression Resolution Plan

## Current State

The meld-ast package has been upgraded from version 3.0.1 to 3.3.0, which introduces support for bracket notation with field type "index". This change affects how array indices are accessed in the AST structure.

### Key Changes in meld-ast 3.3.0

1. **Array Notation Support**: The new version supports bracket notation for accessing array elements.
2. **Field Type Changes**: Array indices now use field type "index" instead of "identifier".
3. **Value Type Changes**: Numeric indices are now represented as numbers instead of strings (e.g., `value: 0` instead of `value: "0"`).

## Progress

### Completed Tasks

1. ✅ Created a new Git branch `fix/meld-ast-upgrade` for the changes
2. ✅ Fixed the failing test in `tests/cli/cli-error-handling.test.ts`
3. ✅ Updated array notation in the following test files:
   - ✅ `tests/utils/tests/TestContext.test.ts`
   - ✅ `tests/meld-ast-nested-fences.test.ts`
   - ✅ `tests/utils/debug/StateHistoryService/StateHistoryService.test.ts`
   - ✅ `tests/utils/debug/StateDebuggerService/StateDebuggerService.test.ts`

### Remaining Tasks

1. ⬜ Fix the failing tests in `api/api.test.ts`
   - The tests are failing due to array notation issues and AST structure changes
   - Need to update the test expectations to match the new AST structure

2. ⬜ Fix the failing tests in `api/integration.test.ts`
   - Many tests are failing due to parse errors with the new meld-ast version
   - Need to update the test content to be compatible with the new syntax

3. ⬜ Verify all tests are passing after the changes

4. ⬜ Create a pull request with the changes

## Implementation Plan

### Phase 1: Fix Core Test Files (Completed)

- ✅ Update array notation in test files to use `.at(0)` instead of `[0]`
- ✅ Fix the failing test in `tests/cli/cli-error-handling.test.ts`

### Phase 2: Fix API Test Files (In Progress)

- ⬜ Update array notation in `api/api.test.ts`
- ⬜ Fix test expectations to match the new AST structure
- ⬜ Update test content to be compatible with the new syntax

### Phase 3: Fix Integration Test Files

- ⬜ Update array notation in `api/integration.test.ts`
- ⬜ Fix test expectations to match the new AST structure
- ⬜ Update test content to be compatible with the new syntax

### Phase 4: Verification and Documentation

- ⬜ Run all tests to verify they pass
- ⬜ Document the changes made
- ⬜ Create a pull request with the changes

## Estimated Timeline

- Phase 1: 1 day (Completed)
- Phase 2: 1-2 days
- Phase 3: 1-2 days
- Phase 4: 1 day

Total: 4-6 days 