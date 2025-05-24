# Plan: Investigate Core Service Failures (Post-Refactor)

## Goal

Systematically investigate and fix the core service failures identified in `_plans/INTEGRATION-TEST-FAILURES.md`, prioritizing fundamental issues uncovered by the refactored API integration tests.

## Confirmed Context & Mental Model

*   **Orchestrator Model:** The likely correct mental model is that `InterpreterService` acts as a central orchestrator, coordinating calls to other services (`DirectiveService`, `ResolutionService`, etc.) which read from and write to a shared `StateService`.
*   **Singleton State Importance:** Registering `IStateService` as a singleton within the test container's scope was crucial for fixing basic variable resolution (`api/array-access.test.ts`). It ensures all services resolved within that scope share the same state instance, aligning with the orchestrator model.
*   **Persisting Failures Indicate Core Issues:** Failures remaining *after* applying the singleton state fix (especially the variable resolution regression in `api/integration.test.ts`) strongly suggest bugs within the core service logic or their interactions during orchestration, rather than just DI setup problems.
*   **Test Setup Standard:** Debugging should use the established pattern: manual child DI container (`container.createChildContainer()`), singleton `IStateService` registration, minimal essential mocks (`IFileSystem`, `DirectiveLogger`), and registration of real core services/factories.
*   **`tests/` Failures:** The numerous failures in `tests/` confirm the impact of recent refactors but should largely be deferred. Focus on fixing core issues identified by `api/` tests first, updating relevant unit tests (`tests/services/...`) opportunistically as services are fixed.

## Recommended Debugging Strategy

*   **Extensive Logging:** Due to potential console output suppression in the test environment (see `docs/dev/TESTS.md`), DO NOT USE `logger.debug` or `console.log` -- instead rely heavily on **`process.stdout.write('DEBUG: [ServiceName] Message\\n');`** for detailed tracing.
*   **Trace Data Flow:** Log key inputs, intermediate values, state lookups/updates, and outputs as data moves between `InterpreterService`, `DirectiveService`, `ResolutionService`, `StateService`, and handlers.
*   **Isolate:** Use the simplest failing test case for the specific issue being investigated.

## Guiding Principles

-   Prioritize fundamental issues (resolution, core directives) first.
-   Isolate failures using minimal test cases where possible.
-   Trace data flow through relevant services.
-   Fix service logic *and* its unit tests concurrently using the established refactoring pattern.
-   Use small, targeted commits.
-   Defer fixing unrelated failures in `tests/` until core functionality is stable.

## Refactoring & Investigation Phases (Revised Order)

**Phase 0: Foundational AST & State Refactor [COMPLETE]**

*   **Rationale:** Foundational issues with state cloning, parent lookups, node identification, and transformation context were hindering progress. Strengthening the state data model (`StateNode`) and AST (`MeldNode`) is crucial before debugging higher-level interactions.
*   **Objectives:**
    *   **AST:** Add unique `nodeId` to all AST nodes (Parser change).
    *   **State Data (`StateNode`):** Enhance with `parentServiceRef`, `transformationOptions`, `createdAt`, `modifiedAt`. Remove redundant `parentState`.
    *   **State Logic (`StateFactory`, `StateService`):** Refactor to correctly use the enhanced `StateNode`, preserve parent links during cloning, manage transformation options via state data, and implement reliable parent lookup in `getVariable`.
    *   **State Interface (`IStateService`):** Remove outdated specific getters (`getTextVar`, `getDataVar`, etc.) and potentially redundant methods (`getCommand`). Remove unused `metadata` parameters from setters if confirmed.
    *   **Debugging Tools (`tests/utils/debug/*`):** Update state tracking and visualization tools to be compatible with the new `StateNode` structure and `parentServiceRef`.
    *   **Tests:** Update all tests related to State, AST, and services using State mocks to reflect the new structures and interfaces.
*   **Detailed Plans:**
    *   AST Node IDs: `_plans/AST-ID.md`
    *   State System Enhancements: `_plans/STATE-UPDATES.md`

**Phase 1: Variable Resolution Stability [COMPLETE]**

*   **Target Failures:** `api/integration.test.ts` #1 (Variable/Data Resolution Regression). `TextDirectiveHandler.test.ts` (TypeError). `DirectiveService.integration.test.ts` (`@data` key interpolation failure).
*   **Hypothesized Services:** `InterpreterService`, `ResolutionService`, `StateService`, `VariableReferenceResolver`, `OutputService`.
*   **Investigation Steps & Findings:**
    1.  **Initial Regression Fixed:** The core regression where simple `{{var}}` failed in `api/integration.test.ts` was resolved by refactoring `StateService` to use `this.parentService` correctly for lookups and fixing `StateFactory` map handling (`_plans/STATE-UPDATES.md` work).
    2.  **Output Formatting Adjusted:** Addressed related assertion failure in `api/api.test.ts` regarding expected XML (`<Meld>` tag) by adjusting the test assertion.
    3.  **`TextDirectiveHandler` Test Fixed:** Resolved `TypeError: createNodeFromExample is not a function` in `TextDirectiveHandler.test.ts` by correcting the function call to the locally defined parser function.
    4.  **`@data` Key Interpolation Fixed:** Investigated the failure in `DirectiveService.integration.test.ts` where `@data { "{{dynamicKey}}": "{{dynamicValue}}" }` resolved incorrectly.
        *   **Root Cause:** Found that `ResolutionService.resolveNodes` relied on `node.nodeId` to map resolved variable values, but nodes created manually in tests via `tests/utils/testFactories.ts` were missing this ID. This caused values for different variables to overwrite each other in the internal map.
        *   **Fix:** Updated `createVariableReferenceNode` in `tests/utils/testFactories.ts` to assign a unique `nodeId` to manually created nodes, making them consistent with parser-generated nodes.
    5.  **Remaining Issues:** Failures related to variable resolution within specific directives (`@run`, special `@path` vars) persist and are tracked in Phases 3 & 4.
*   **Fix & Verify:** Fixes implemented in `StateService`, `StateFactory`, `tests/utils/testFactories.ts`, and `TextDirectiveHandler.test.ts`. Unit tests (`StateService.test.ts`, `StateFactory.test.ts`) updated and passing. `api/api.test.ts` adjusted. `DirectiveService.integration.test.ts` and `TextDirectiveHandler.test.ts` now pass relevant tests. Basic variable and data resolution appears stable, pending fixes in later phases.

**Phase 2: `@import` Directive Processing [In Progress - DI Scope Fix]**

*   **Target Failures:** `api/integration.test.ts` #3 (`@import` Directive Processing), #4 (Circular Import Detection - Error Message).
*   **Hypothesized Services:** `InterpreterService`, `DirectiveService`, `ImportDirectiveHandler`, `StateService`, `ParserService`, `FileSystemService`, `InterpreterServiceClientFactory`, `CircularityService`, DI Container (`api/integration.test.ts`).
*   **Investigation Steps & Findings:**
    1.  **Initial Error:** `@import` tests failed with "Path validation failed for resolved path \"\": Path cannot be empty".
    2.  **Fix 1:** Two-step path resolution in `ImportDirectiveHandler` (resolveInContext → resolvePath) fixed the empty path error.
    3.  **Fix 2:** Lazily resolved `ICircularityService` within handler to address DI injection mismatch; unit tests now pass in isolation.
    4.  **OOM & DI Scope Fix:** Refactored `StateService.createChildState` to use `container.createChildContainer()` and register parent state via DI, resolving Heap OOM (`_plans/FIX-API-TEST-OOM.md`).
*   **Current Status:** Import logic and DI scope fixes have cleared OOM and core errors, but `api/integration.test.ts` import tests now fail with `Attempted to resolve unregistered dependency token: "ParentStateServiceForChild"`, indicating the child-state DI registration needs correction.
*   **Next Steps:**
    1.  **Fix ParentStateServiceForChild DI Error:** Register and inject the parent state token correctly in `StateService.createChildState`.
    2.  **Re-run Import Tests:** Run `npm test api` to confirm import directives succeed.
    3.  **Revert Workarounds:** Remove the lazy-resolution workaround for `ICircularityService` if DI is stable.
    4.  **Proceed to Phase 3:** Investigate and fix `@run` directive execution and variable resolution (`RunDirectiveHandler`).
    5.  **Proceed to Phase 4:** Investigate and fix special path variable resolution (`@path` directives).
    6.  **Proceed to Phase 5:** Finalize circular import detection fixes and verify the expected error.

**Phase 3: `@run` Directive Processing [Deferred pending DI Refactor & OOM resolution]**

*   **Target Failures:** `api/api.test.ts` #1 (`@run` Directive Execution), #2 (Variable Resolution within `@run`). Tests fail with "Run directive command cannot be empty".
*   **Hypothesized Services:** `InterpreterService`, `DirectiveService`, `RunDirectiveHandler`, `ResolutionService`, `ParserService`.
*   **Investigation Steps:**
    1.  **Command Parsing:** Add logging inside `RunDirectiveHandler.handle` to inspect the parsed command *before* any variable resolution attempt. Why is it perceived as empty in the failing `api.test.ts` cases? Is the AST structure for `@run` correct or being misinterpreted?
    2.  **Variable Resolution in Command:** Add logging *before* command execution to trace the resolution of variables within the command string (e.g., `{{greeting}}` in `echo {{greeting}}`). Does it call `ResolutionService.resolveNodes` (or similar) on the command string/nodes? What is the result?
    3.  **Execution Logic:** Trace the actual command execution logic within the handler.
*   **Fix & Verify:** Implement fixes. Refactor/update `RunDirectiveHandler.test.ts`. Re-run failing `@run` tests in `api/api.test.ts` (after OOM is fixed).

**Phase 4: Special Path Variable Resolution (`@path`) [Deferred pending DI Refactor & OOM resolution]**

*   **Target Failures:** `api/integration.test.ts` tests for `$PROJECTPATH`, `$.`, `$HOMEPATH`, `$~` fail with "Path validation failed for resolved path \"\": Path cannot be empty".
*   **Hypothesized Services:** `PathService`, `ResolutionService`, `PathDirectiveHandler`, `FileSystemServiceClientFactory` (and underlying client/FS).
*   **Investigation Steps & Findings:**
    1.  **Logging Added:** Added logging to `ResolutionService.resolvePath` and `PathDirectiveHandler`.
    2.  **Empty String Input:** Logs confirm that `ResolutionService.resolvePath` is receiving an empty string `""` as input for `resolvedPathString` in the failing tests, before the OOM crash occurs when running the isolated test suite.
    3.  **Premature Resolution:** The empty string originates from the call to `resolutionService.resolveInContext(valueToResolve, ...)` within `PathDirectiveHandler`. This indicates `resolveInContext` (or its delegate `resolveText`) is incorrectly attempting to resolve variable-like strings starting with `$PROJECTPATH`, `$HOMEPATH`, `$.`, or `$~` when called in contexts where these should be treated as path literals (like within `@path` directives). It should return the string literal in these cases.
*   **Next Steps:**
    1.  **(Blocked by OOM)** Fix `resolveInContext`/`resolveText`: Modify `ResolutionService.resolveText` (or its use of `parseForResolution`) to ensure it does *not* attempt to resolve variable-like strings starting with `$PROJECTPATH`, `$HOMEPATH`, `$.`, or `$~` when called in contexts where these should be treated as path literals (like within `@path` directives). It should return the string literal in these cases.
    2.  **(Blocked by OOM)** Re-run isolated `@path` tests (`describe.only`) after fixing the resolution logic (and resolving the OOM) to confirm the "Path cannot be empty" errors are fixed and the paths are stored correctly.
    3.  **(Blocked by OOM)** Verify the correct alias expansion occurs during final output rendering (if applicable, or ensure `PathService` handles them correctly later).
    4.  Refactor/update `PathDirectiveHandler.test.ts`, `PathService.test.ts`, `ResolutionService.test.ts`.

**Phase 5: Circular Import Detection [Deferred pending DI Refactor & OOM resolution]**

*   **Target Failures:** `api/integration.test.ts` #4 (Circular Import Detection - throwing wrong error).
*   **Hypothesized Services:** `CircularityService`, `InterpreterService`, `ImportDirectiveHandler`, `StateService`.
*   **Investigation Steps:**
    1.  **Trace `CircularityService` Calls:** Add logging where `CircularityService.push` and `pop` (or equivalent methods) are called during the import process (likely within `InterpreterService` or `ImportDirectiveHandler`). Log the file paths being pushed/popped.
    2.  **Check Detection Logic:** Review the `CircularityService.check` (or equivalent) logic. Is it correctly identifying the loop based on the pushed paths?
    3.  **Verify Error Propagation:** If the error *is* detected by `CircularityService`, is it being correctly thrown and propagated up the call stack to cause `processMeld` to reject? Why is the wrong error ("Interpreter service client not available") being thrown instead? (Likely due to the DI issue preventing interpretation).
*   **Fix & Verify:** Implement fixes. Refactor/update `CircularityService.test.ts` and potentially `ImportDirectiveHandler.test.ts`. Re-run the circular import test after fixing the DI issue in Phase 2 (and OOM resolved).

**Phase 6: Remaining API Harness & Minor Output Issues [In Progress]**

*   **Target Failures:**
    *   `api/smoke.test.ts` errors (`TypeInfo not known for "undefined"`).
    *   Test harness errors in `api/api.test.ts` and `api/integration.test.ts` due to outdated `TestContextDI` API (`initialize`/`cleanup` not functions`).
    *   `api/api.test.ts` #3 (Example File Output) failures and other output discrepancies.
*   **Investigation Steps:**
    1.  **TestContextDI Audit:** Review `TestContextDI` API changes; update tests to remove or replace `initialize()` and `cleanup()` calls, ensure correct container disposal.
    2.  **TypeInfo Fallback:** Investigate `TypeInfo not known for "undefined"` in `processMeld`; add default TypeInfo or guard for undefined in type resolution.
    3.  **Smoke & API Tests:** Re-run smoke, API, and integration tests after test harness fixes to assess remaining failures.
*   **Fix & Verify:**
    1.  Refactor `api/smoke.test.ts`, `api/api.test.ts`, and `api/integration.test.ts` to align with updated TestContextDI API and container usage.
    2.  Implement fallback logic for undefined TypeInfo in core resolution service.
    3.  Run `npm test api`; confirm smoke tests, harness errors, and Example File Output are resolved.
