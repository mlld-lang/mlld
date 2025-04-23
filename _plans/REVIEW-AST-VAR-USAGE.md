# Plan: Review Directive Handler Usage of State Changes

**Objective:** Ensure all Directive Handlers (`IDirectiveHandler`) and their corresponding unit tests consistently use and expect the `stateChanges` property in the `DirectiveResult`, aligning with the design established in `_plans/AST-VARIABLES-done.md`.

**Background:**
A discrepancy was found between the `DirectiveResult` interface definition and the expectations in the `TextDirectiveHandler.test.ts`. The tests correctly expected a `stateChanges` property (as per recent design changes), while the interface and the handler implementation did not reflect this. This plan outlines the steps to review all handlers for consistency.

**Steps:**

1.  **Finalize `DirectiveResult` Interface:**
    *   Review the definition of `DirectiveResult` in `services/pipeline/DirectiveService/types.ts`.
    *   Ensure it includes the optional `stateChanges` property.
    *   Define or import the correct type for `stateChanges` (e.g., `StateDelta` or a similar structure representing variable/command changes).
    *   **Action:** Update `DirectiveResult` interface definition.

2.  **Identify All Directive Handlers:**
    *   Locate all classes implementing the `IDirectiveHandler` interface, typically within `services/pipeline/DirectiveService/handlers/`.

3.  **Review Each Handler Implementation:**
    *   For each identified handler:
        *   Examine the `handle` method's return statement.
        *   Verify it returns an object conforming to the updated `DirectiveResult` interface.
        *   Confirm that modifications to state (variables, commands) are correctly packaged within the `stateChanges` object returned by the handler, rather than (or perhaps in addition to?) directly modifying the input `state` object. *[Decision Required: Clarify if handlers should modify input state AND return changes, or ONLY return changes]*. 
        *   **Action:** Update handler implementations as needed.

4.  **Review Corresponding Unit Tests:**
    *   For each handler's test file (e.g., `*.test.ts`):
        *   Verify that test assertions correctly check for the `result.stateChanges` property and its expected structure.
        *   Remove or update any assertions that incorrectly check for direct modifications to the mocked `state` service if the handler is supposed to return changes via `stateChanges`.
        *   Ensure mocks related to state modification (e.g., `stateService.setVariable`) are adjusted based on whether the handler directly modifies state or returns `stateChanges`.
        *   **Action:** Update test files as needed.

5.  **Run Tests:**
    *   After modifications, run all relevant tests (`npm test api services` or more specific targets) to confirm alignment and functionality.

**Target Handlers (Initial List - Requires Confirmation):**
*   `DefineDirectiveHandler`
*   `EmbedDirectiveHandler`
*   `ImportDirectiveHandler`
*   `IncludeDirectiveHandler`
*   `RunDirectiveHandler`
*   `SetDirectiveHandler`
*   `TextDirectiveHandler` (Partially addressed)
*   * Potentially others...*

**Tracking:**
*   [ ] Finalize `DirectiveResult` Interface
*   [ ] Identify All Handlers
*   [ ] Review/Update `DefineDirectiveHandler` & Tests
*   [ ] Review/Update `EmbedDirectiveHandler` & Tests
*   [ ] Review/Update `ImportDirectiveHandler` & Tests
*   [ ] Review/Update `IncludeDirectiveHandler` & Tests
*   [ ] Review/Update `RunDirectiveHandler` & Tests
*   [ ] Review/Update `SetDirectiveHandler` & Tests
*   [ ] Review/Update `TextDirectiveHandler` & Tests (Complete)
*   [ ] Review/Update *Other Handlers* & Tests
*   [ ] Final Test Run
