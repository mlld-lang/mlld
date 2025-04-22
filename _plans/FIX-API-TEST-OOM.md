# Debug Log: Resolving API Test Failures (OOM & DI Scopes)

## Initial Problem

After major refactors related to AST, State management, Types, and Directive Handlers, the API integration tests (`npm test api`) started failing with:

1.  JavaScript heap out of memory errors (OOM), particularly in tests involving `@import` directives.
2.  Worker exited unexpectedly errors.
3.  Specific test failures related to circular import detection (throwing DI errors instead of expected circularity errors).
4.  Other functional failures (variable resolution, output formatting).

## Investigation & Fixes Summary

We systematically investigated the failures using extensive logging (`process.stdout.write`) and targeted code changes.

1.  **Variable Resolution Issues Fixed:** Several underlying bugs preventing basic variable definition and resolution were fixed first (detailed in previous versions of this log, involving `StateFactory` map merging and missing `name` properties in handler results).

2.  **Initial DI Scope Investigation:** We explored making various services singletons within the test container (`api/integration.test.ts`) and explicitly passing the container or specific service instances (`ICircularityService`) during recursive `interpret` calls made by `ImportDirectiveHandler`. Extensive logging was added.

3.  **Findings from DI Logging:**
    *   Logs confirmed that crucial stateful services (`CircularityService`) were being re-instantiated during recursive imports, causing their state (like the import stack) to reset.
    *   The `InterpreterServiceClientFactory` and `ImportDirectiveHandler` constructors were receiving containers with `unknown` IDs, indicating they were not being resolved within the scope of the intended child `testContainer` created in the `beforeEach` block.
    *   Neither registering services/factories as singletons nor explicitly passing the container/service instance solved the core scope problem.

4.  **Root Cause Identified (`StateService.createChildState`):**
    *   Investigation revealed that `StateService.createChildState` was manually creating child state instances using `new StateService(...)`.
    *   This **bypassed the DI container** for the child state and all dependencies resolved *by* that child state instance (including nested `InterpreterService`, `DirectiveService`, `ImportDirectiveHandler`, `CircularityService` calls during import interpretation).
    *   This manual instantiation broke the singleton scope inheritance chain, leading to new service instances being created with incorrect (or global) scope, thus losing the `CircularityService` stack and causing infinite recursion and the OOM error.

5.  **Fix Implemented:**
    *   Injected `DependencyContainer` into `StateService` constructor.
    *   Modified `StateService.createChildState` to:
        *   Create a `childContainer` using `this.container.createChildContainer()`.
        *   Register the parent `StateService` instance (`this`) within the `childContainer` using a specific token (`'ParentStateServiceForChild'`).
        *   Resolve the new `StateService` instance using `childContainer.resolve(StateService)`.
    *   Modified the `StateService` constructor to optionally inject `'ParentStateServiceForChild'` and assign it to `this.parentService`.

6.  **Result:** This ensures that child states are created *through the DI container*, preserving the correct scope and allowing singleton services (like `ICircularityService`) registered in the parent test container to be correctly resolved and reused during recursive interpretation.

## Current Status (After DI Scope Fixes)

*   **OOM Error:** Resolved. The recursive import tests no longer exhaust memory.
*   **Circular Import Detection:** The test `should detect circular imports` now fails with the expected `MeldImportError` related to circularity, rather than the previous DI error. (This is a positive sign, showing the correct error is now reachable).
*   **Other Import Tests:** Tests `should handle simple imports` and `should handle nested imports` now fail with a different DI error: `Attempted to resolve unregistered dependency token: "ParentStateServiceForChild"`. This indicates the constructor adaptation for the child state injection needs further refinement.
*   **Variable Resolution:** Appears stable based on previously passing tests.
*   **Output Formatting Failures:** Likely still present in `api/api.test.ts` (not run in the last step).
*   **DI Failure:** `api/debug-tools.integration.test.ts` failure likely still present.

## Next Steps

1.  **Fix `ParentStateServiceForChild` DI Error:** Investigate why the token `'ParentStateServiceForChild'`, despite being registered in the child container within `createChildState`, is not found when resolving `StateService` via `childContainer.resolve(StateService)`. Check constructor signature and injection points again.
2.  **Verify Circular Import Test:** Once the DI error is fixed, confirm the `should detect circular imports` test passes by correctly identifying the `MeldImportError`.
3.  **Address Remaining Failures:** Re-run `npm test api` and address the remaining functional failures (e.g., output formatting in `api.test.ts`, DI issues in `debug-tools.integration.test.ts`, etc.). 