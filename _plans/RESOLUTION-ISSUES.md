# ResolutionService Test Failures Analysis (Phase 3)

This document outlines the findings from analyzing the 39 test failures in `services/resolution/ResolutionService/ResolutionService.test.ts` after completing the refactoring steps for Phase 3 involving `VariableReferenceResolver` and `CommandResolver`.

The goal is to document the issues and potential fixes without applying them at this stage.

**Test Run Command:** `npm test services/resolution/ResolutionService/ResolutionService.test.ts`

## Issue Categories

### 1. Service Method Not Found Errors (e.g., `TypeError: service.resolveText is not a function`)

*   **Affected Tests:** The majority of failures (tests for `resolveInContext`, `resolveText`, `resolveData`, `resolvePath`, `resolveFile`, `extractSection`, `validateResolution`, `detectCircularReferences`, `resolveFieldAccess`).
*   **Symptom:** Tests fail immediately when trying to call a method on the `service` instance, indicating the method doesn't exist on the object being tested.
*   **Root Cause Analysis (Revised):** The `IResolutionService` interface *does* define these methods. The issue is likely that the `service` object instantiated in the `beforeEach` block via the DI container (`service = await testContext.resolve<IResolutionService>('IResolutionService')`) is not being created correctly or is incomplete. This could stem from:
    *   Errors in the `ResolutionService` constructor or its initialization logic when running in the test environment.
    *   Problems with the dependency injection setup (`TestContextDI`) or how mock dependencies (`stateService`, `pathService`, etc.) are registered and injected.
    *   The `ResolutionService` class itself not being correctly registered within the test DI container.
*   **Presumptive Fix:**
    1.  Verify `ResolutionService` is correctly registered with the `TestContextDI` container.
    2.  Debug the `testContext.resolve<IResolutionService>('IResolutionService')` call to see what object is actually being returned.
    3.  Review the `ResolutionService` constructor and any internal initialization steps for potential errors triggered by mocked dependencies.
    4.  Ensure all dependencies required by `ResolutionService` are correctly mocked and registered using `testContext.registerMock()`.
*   **Confidence:** High (This is the most likely cause for widespread `method is not a function` errors when the interface clearly defines the methods).
*   **Further Investigation:**
    *   Add logging within the `ResolutionService` constructor.
    *   Step-debug the test setup (`beforeEach`) focusing on the DI resolution.
    *   Examine the implementation details of `TestContextDI` if necessary.

### 2. Missing Error Imports

*   **Affected Tests:** Tests using `expect(...).toThrow()` or `expectToThrowWithConfig` for specific custom error types (e.g., `resolveFieldAccess > should handle non-existent variable`, `resolveFieldAccess > should handle invalid field access in strict mode`, `resolveData > should handle non-existent variable`, `resolvePath > should handle non-existent variable`, `resolveText > should handle non-existent variable in strict mode`, `resolveText > should detect circular references`).
*   **Symptom:** `ReferenceError: VariableResolutionError is not defined` or `ReferenceError: FieldAccessError is not defined`.
*   **Root Cause Analysis:** The test file (`ResolutionService.test.ts`) lacks the necessary `import` statements for these custom error classes.
*   **Presumptive Fix:** Add `import { VariableResolutionError, FieldAccessError } from '@core/errors/index.js';` (or the correct path) to the top of `services/resolution/ResolutionService/ResolutionService.test.ts`.
*   **Confidence:** High.
*   **Further Investigation:** None needed, just apply the import fix.

### 3. Mocking Failures (`resolveCommand` tests)

*   **Affected Tests:** `resolveCommand > should execute basic command`, `resolveCommand > should handle non-existent command`, `resolveCommand > should handle command execution error`.
*   **Symptom:** `TypeError: Cannot read properties of undefined (reading 'mockReturnValue')` pointing to `vi.mocked(stateService.getCommandVar).mockReturnValue(...)`.
*   **Root Cause Analysis:** The mock setup for `stateService.getCommandVar` seems incorrect or incomplete within the test or `beforeEach`. It might not be correctly attached to the `stateService` mock object, or the refactoring changed how commands are retrieved/handled.
*   **Presumptive Fix:**
    1.  Carefully review the `beforeEach` block where `stateService` is mocked. Ensure the `getCommandVar` method is correctly defined on the mock object.
    2.  Check the implementation of `ResolutionService.resolveCommand` and its interaction with `CommandResolver` to understand how `stateService.getCommandVar` (or equivalent) is expected to be called now.
    3.  Update the mock implementation to align with the current expected usage and return values (`CommandVariable` or `undefined`).
*   **Confidence:** Medium (Requires understanding the current implementation flow).
*   **Further Investigation:**
    *   Examine the `CommandResolver` implementation and how it gets variables.
    *   Trace the execution flow for the failing `resolveCommand` tests.
    *   Verify the structure of the `CommandVariable` type expected by the resolver.

## Summary & Next Steps

The most critical issue appears to be the potential failure in instantiating or mocking the `ResolutionService` itself within the test environment (Category 1). Addressing this is likely the key to resolving the bulk of the test failures. The other issues (missing imports, command mocking) are more localized.

The recommended next step (after this documentation phase) would be to focus on fixing Category 1 by debugging the test setup and DI container interactions. 