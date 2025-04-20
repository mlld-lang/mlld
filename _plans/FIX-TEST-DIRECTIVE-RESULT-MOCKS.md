# Plan: Fix Test Failures from DirectiveResult Validation

## Goal

Address the test failures in `InterpreterService.integration.test.ts` and `ImportDirectiveHandler.test.ts` that were exposed after adding stricter validation for the `DirectiveResult` shape returned by directive handlers/mocks.

## Problem Context

- Adding validation in `InterpreterService.interpret` to ensure the result from `directiveClient.handleDirective` is a valid `DirectiveResult` object (containing `stateChanges` and/or `replacement`) caused ~18 tests in the integration suite and ~3 unit tests to fail.
- These failures indicate that the mocks for `IDirectiveServiceClient.handleDirective` in those tests were returning invalid shapes (e.g., just the `IStateService` instance).
- Separately, 6 failures remain in `ImportDirectiveHandler.test.ts` related to mocking `IInterpreterServiceClient.interpret` and handling its results/errors.

## Strategy

### Phase 1: Fix `InterpreterService.integration.test.ts` Mocks

-   **Objective:** Update the default mock implementation for `mockDirectiveClient.handleDirective` in the `beforeEach` block of `services/pipeline/InterpreterService/InterpreterService.integration.test.ts` to return a valid, empty `DirectiveResult`.
-   **File:** `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`
-   **Action:**
    -   Locate the `vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementation(...)` line in `beforeEach`.
    -   Change the implementation to return `{ stateChanges: undefined, replacement: [] }` instead of `context.state`.
-   **Verification:** Run `npm test services/pipeline/InterpreterService/InterpreterService.integration.test.ts` and confirm the ~18 `Invalid result type` errors are resolved. Other failures might persist.

### Phase 2: Fix Remaining `InterpreterService.unit.test.ts` Failures

-   **Objective:** Resolve the final failure(s) in the unit test file, likely related to mock interactions or test logic uncovered by previous fixes.
-   **File:** `services/pipeline/InterpreterService/InterpreterService.unit.test.ts`
-   **Current Failures (as of last run):**
    -   `handles empty node arrays...`: `AssertionError: expected "spy" to be called at least once` (on `createChildState`).
    -   Potentially others revealed after fixing integration tests.
-   **Action:**
    -   Investigate the `handles empty node arrays...` test. Ensure the spy on `createChildState` is correctly placed and checked relative to the code path when `nodes` is empty. The fix in `interpret` to always create a child state should have resolved this, so the test assertion might be flawed.
    -   Address any other failures that appear after Phase 1.
-   **Verification:** Run `npm test services/pipeline/InterpreterService/InterpreterService.unit.test.ts` and confirm all tests pass.

### Phase 3: Fix `ImportDirectiveHandler.test.ts` Failures

-   **Objective:** Diagnose and fix the 6 remaining failures related to mocking `interpreterServiceClient.interpret` and processing its results/errors.
-   **File:** `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts`
-   **Current Failures (as of last run):**
    -   `should handle $. alias...`: State changes missing (`toHaveProperty("sampleVar")`).
    -   `should handle user-defined path variables...`: `interpret` mock not called.
    -   `should import all variables with *`: `interpret` mock not called.
    -   `should import specific variables with alias`: `interpret` mock not called.
    -   `should handle interpretation errors...`: Promise resolved instead of rejecting.
    -   **NEW?**: A test now failing with `Internal error: Failed to get valid state from interpreted import content.` (Needs confirmation after fixing other tests).
-   **Action:**
    -   Carefully review the `beforeEach` and the setup within each failing test for `interpreterServiceClient.interpret`. Ensure `mockResolvedValue` is consistently used with `createMockInterpretedState()`.
    -   For the tests where `interpret` isn't called, check if preceding mocks (e.g., `resolvePath`, `readFile`, `parse`) might be throwing errors unexpectedly or if the test logic path doesn't reach the `interpret` call. Add temporary logging if needed.
    -   For the state changes failure (`should handle $. alias...`), verify the `createMockInterpretedState` call includes the expected `sampleVar` and that the handler's variable accumulation logic (`getAllTextVars`, etc.) is working correctly with the mocked state.
    -   For the error handling test, ensure the `interpret` mock is correctly set up with `mockRejectedValue` and that the `catch` block in the handler's `handle` method correctly throws a `DirectiveError`.
-   **Verification:** Run `npm test services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts` and confirm all tests pass.

### Phase 4: Final Verification

-   **Objective:** Ensure all service-level tests pass.
-   **Action:** Run `npm test services`.
-   **Verification:** Confirm zero failures.

## Next Step

Start Phase 1 by editing `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`. 