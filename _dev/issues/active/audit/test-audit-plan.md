# Test Audit Plan

## Overview
This document outlines the plan for auditing and updating tests to comply with the TESTS.md standards and ensure proper DI implementation.

## Phase 1: Audit

### Audit Process
1. Review each test file systematically to:
   - Check for compliance with TESTS.md standards
   - Identify specific issues related to DI implementation
   - Document specific modifications needed

2. Create a prioritized list of tests to update, focusing on:
   - Tests that are currently failing
   - Tests with circular dependencies
   - Tests that use services with factory patterns (particularly Interpreter and Directive Services)
   - All tests that use mocks and might be affected by DI changes

### Test Categorization
For each test, assign one of the following categories:
- 🟢 **Compliant**: Test follows TESTS.md standards and works with DI
- 🟡 **Minor Issues**: Test mostly follows standards but needs minor adjustments
- 🟠 **Major Issues**: Test needs significant restructuring to work with DI
- 🔴 **Critical Failure**: Test is completely broken and blocking other functionality

### Specific Areas to Check
For each test file, examine:

1. **Context Setup**
   - Uses `TestContextDI.createIsolated()` instead of direct instantiation
   - Properly cleans up resources with `context?.cleanup()`

2. **Service Resolution**
   - Uses async resolution with `await context.resolve(...)` instead of synchronous methods
   - Registers mocks before resolving services that depend on them

3. **Mock Registration**
   - Uses `context.registerMock()` instead of direct mock injection
   - Uses standardized mock factories when appropriate

4. **Factory Pattern Handling**
   - Properly mocks factory classes when needed
   - Handles lazy initialization patterns correctly

5. **Error Testing**
   - Uses `expectToThrowWithConfig` for error validation

### Mock Identification
To ensure we identify all tests that use mocks:

1. **Check for Mock Indicators**:
   - Direct usage of `vi.fn()` or `vi.mock()`
   - Files that import or reference mock utilities
   - Usage of any mock factories or test helpers
   - Any test file with service dependencies

2. **Search Patterns**:
   - Use code search to find `vi.fn()`, `vi.mock()`, `mock`, `createMock`, etc.
   - Look for test files that import service interfaces
   - Identify files containing `beforeEach` that set up mocks

### Comprehensive Audit Approach
To ensure all test files with mocks are identified:

1. **Automated Analysis**:
   - Run the audit script on all test files
   - Identify any files with mocking patterns

2. **Manual Inspection**:
   - Review all service directories for associated test files
   - Examine integration tests that might use service mocks
   - Check handler tests for proper DI implementation

3. **Group by Service Area**:
   - State Service tests
   - DirectiveService tests
   - InterpreterService tests
   - ResolutionService tests
   - FileSystemService tests
   - Utilities and other services

### Output Format
Create a tracking document with the following structure for each test file:

```
## [File Path]

**Category**: 🟢/🟡/🟠/🔴

**Issues**:
- Issue 1
- Issue 2

**Required Changes**:
- Change 1
- Change 2

**Notes**:
Any additional information or considerations
```

## Priority Test Files
While all test files with mocks will be audited, these files should be examined first:

1. `services/pipeline/InterpreterService/InterpreterService.unit.test.ts`
2. `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts`
3. `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts`
4. `api/integration.test.ts`

## Secondary Test Groups
After the priority files, we'll audit these groups in order:

1. **Service Tests**:
   - All remaining DirectiveService handler tests
   - Other InterpreterService tests
   - StateService tests
   - ResolutionService tests

2. **Integration Tests**:
   - API tests
   - Transformation tests
   - Debug-related tests

3. **Utility Tests**:
   - Any utility tests with mocks
   - CLI and command tests

## Audit Tracking
The results of this audit will be compiled into a separate document that lists all tests requiring updates and their associated priority.

This document lists failing and skipped tests that need to be prioritized for updates to the DI architecture.

## Priority 1: Currently Failing Tests

These tests are actively failing and should be fixed first:

### InterpreterService Tests

The following tests in `services/pipeline/InterpreterService/InterpreterService.unit.test.ts` are failing with `TypeError: this.stateService.createChildState is not a function`:

1. `processes text nodes directly`
2. `delegates directive nodes to directive service`
3. `throws on unknown node types`
4. `clones state for each interpretation`
5. `returns the final state`
6. `handles empty node arrays`
7. `wraps non-interpreter errors`
8. `preserves interpreter errors`
9. `extracts location from node for errors`
10. `sets file path in state when provided`
11. `passes options to directive service`
12. `creates a child context with parent state` (TypeError: parentState.getCurrentFilePath is not a function)
13. `sets file path in child context when provided` (TypeError: parentState.getCurrentFilePath is not a function)
14. `handles errors in child context creation`
15. `handles state rollback on partial failures`
16. `handles null or undefined nodes gracefully`
17. `handles directive service initialization failures`
18. `preserves original error stack traces`
19. `handles nodes without location information`
20. `handles nodes with partial location information`

### ImportDirectiveHandler Tests

The following test in `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts` is failing:

1. `should import all variables with *` - DirectiveError: Cannot read properties of undefined (reading 'getAllTextVars')

## Detailed Analysis of Failing Tests

### InterpreterService Test Analysis

**Root Cause**: 
The mock for StateService is missing the `createChildState` method that the InterpreterService now requires. This is a dependency injection issue where the test mock does not implement all the required methods of the interface.

Looking at the test setup, we can see:

```typescript
const createMockStateService = () => ({
  addNode: vi.fn(),
  setCurrentFilePath: vi.fn(),
  getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld'),
  clone: vi.fn().mockReturnValue({
    addNode: vi.fn(),
    setCurrentFilePath: vi.fn(),
    getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld')
  })
});
```

This mock is missing the `createChildState` method that is now being called in the InterpreterService.

**Suggested Fix**:
1. Update the mock to include the `createChildState` method:
   ```typescript
   const createMockStateService = () => ({
     addNode: vi.fn(),
     setCurrentFilePath: vi.fn(),
     getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld'),
     createChildState: vi.fn().mockReturnValue({
       addNode: vi.fn(),
       setCurrentFilePath: vi.fn(),
       getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld')
     }),
     clone: vi.fn().mockReturnValue({
       addNode: vi.fn(),
       setCurrentFilePath: vi.fn(),
       getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld')
     })
   });
   ```

2. Ensure the test is properly using async/await with the DI container.

### ImportDirectiveHandler Test Analysis

**Root Cause**:
The error suggests that the state object is undefined when trying to call `getAllTextVars()` on it. This is likely due to improper mock setup or initialization in the DI container.

**Suggested Fix**:
1. Ensure the state service mock is properly initialized and registered with the DI container
2. Verify that the state object is being passed correctly to the ImportDirectiveHandler
3. Add proper async/await for service resolution

## Priority 2: Skipped Tests

These tests have been skipped and should be updated to work with the DI architecture:

### Import Related Tests

1. `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts`:
   - `should import specific variables`
   - `should handle invalid import list syntax`

2. `services/pipeline/DirectiveService/DirectiveService.test.ts`:
   - `should process basic import`
   - `should handle nested imports`

3. `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`:
   - `maintains correct file paths during interpretation`

4. `api/integration.test.ts`:
   - `should handle simple imports`
   - `should handle nested imports with proper scope inheritance`

### State Management Tests

1. `services/state/StateService/StateService.test.ts`:
   - `should register cloned state in tracking service`

### CLI Tests

1. `cli/cli.test.ts`:
   - `should pass environment variables to API`
   - `should handle watch mode`
   - `should handle exit codes properly`
   - `File Overwrite Confirmation` (entire describe block)

2. `cli/commands/init.test.ts`:
   - `should exit if meld.json already exists`

### Output Format Tests

1. `tests/codefence-duplication-fix.test.ts`:
   - `should not duplicate code fence markers in CLI output`
   - `should not duplicate code fence markers in XML output format`

### Mock Command Tests

1. `tests/utils/examples/RunDirectiveCommandMock.test.ts`:
   - `should execute commands and store output in state variables`
   - `should handle command execution failures`
   - `should support custom output variables`

### Validation Tests

1. `services/resolution/ValidationService/validators/FuzzyMatchingValidator.test.ts`:
   - `should reject fuzzy thresholds below 0`
   - `should reject fuzzy thresholds above 1`
   - `should reject non-numeric fuzzy thresholds`

## Priority 3: TODO Tests

These tests are marked as `todo` and should be implemented once the failing and skipped tests are fixed:

### InterpreterService Tests

1. `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`:
   - `handles nested imports with state inheritance`
   - `maintains correct state after successful imports`
   - `handles nested directive values correctly`

### TextDirectiveHandler Tests

1. `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts`:
   - `should handle circular reference detection`
   - `should handle error propagation through the stack`
   - `should handle mixed directive types`

### API Tests

1. `api/api.test.ts`:
   - `should handle large files efficiently`
   - `should handle deeply nested imports`

## Update Strategy

For each failing or skipped test:

1. Update the test setup to use `TestContextDI.createIsolated()`
2. Register required mocks using `context.registerMock()`
3. Resolve services using async/await with `await context.resolve()`
4. Add proper cleanup in `afterEach` blocks
5. Update error testing to use `expectToThrowWithConfig`
6. Implement factory patterns where required
7. Run tests and verify they pass

## Progress Tracking

| Test File | Status | Assigned To | Notes |
|-----------|--------|-------------|-------|
| `services/pipeline/InterpreterService/InterpreterService.unit.test.ts` | 🔴 Failing | | State service mock needs to implement createChildState |
| `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts` | 🔴 Failing | | State object is undefined when trying to access getAllTextVars |
| ... | | | |

## Next Steps

1. Fix the InterpreterService tests first since they have the most failures
2. Then address the ImportDirectiveHandler failing test
3. Move on to skipped tests, prioritizing those related to core functionality
4. Finally implement the TODO tests once the infrastructure is stable