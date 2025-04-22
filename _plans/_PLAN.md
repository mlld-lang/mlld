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

**Phase 2: `@import` Directive Processing [In Progress - OOM Blocker]**

*   **Target Failures:** `api/integration.test.ts` #3 (`@import` Directive Processing), #4 (Circular Import Detection - Error Message). Original DI errors now masked by OOM.
*   **Hypothesized Services:** `InterpreterService`, `DirectiveService`, `ImportDirectiveHandler`, `StateService`, `ParserService`, `FileSystemService`, `InterpreterServiceClientFactory`, `CircularityService`, DI Container (`api/integration.test.ts`).
*   **Investigation Steps & Findings:**
    1.  **Initial Error:** `@import` tests initially failed with "Path validation failed for resolved path \"\": Path cannot be empty".
    2.  **Fix 1:** Modified `ImportDirectiveHandler` to perform two-step path resolution: first call `resolutionService.resolveInContext` on the `pathObject`, then pass the resulting *string* to `resolutionService.resolvePath`. This fixed the "Path cannot be empty" error for imports.
    3.  **New Error (DI Related):** This unmasked a new failure: `TypeError: this.circularityService.beginImport is not a function` during import execution within integration tests (`api/integration.test.ts`). This occurred despite `ICircularityService` being correctly registered in the test container setup (`beforeEach`).
    4.  **DI Debugging:** Added logging inside `ImportDirectiveHandler` confirming that the instance injected via the constructor for `ICircularityService` was incorrect (it was an `InterpreterServiceClientFactory` instance). However, explicitly resolving `ICircularityService` from the injected container *within the handler's `handle` method* yielded the correct service instance.
    5.  **Fix 2 (DI Workaround):** Modified `ImportDirectiveHandler` to remove `ICircularityService` from constructor injection and instead resolve it lazily from the injected `DependencyContainer` within the `handle` method just before use.
    6.  **Result:** This workaround resolved the `this.circularityService.beginImport is not a function` error, and the `@import` integration tests (`simple`, `nested`, `circular`) now appear to execute the core import logic correctly before the test process crashes due to Heap OOM.
    7.  **Unit Test Validation:** Unit tests (`ImportDirectiveHandler.unit.test.ts`) pass, confirming the handler's isolated logic.
*   **OOM Investigation Summary (Post-Fix 2):**
    *   **Initial State:** After applying the lazy-resolution workaround for `ICircularityService` in `ImportDirectiveHandler`, the OOM error became the primary blocker in `api/integration.test.ts`. Initial hypotheses focused on state cloning or import recursion depth.
    *   **DI Instability Identified:** Further investigation revealed inconsistent DI behavior across different test files (`api/*.test.ts`). While `api/integration.test.ts` correctly resolved dependencies (after the lazy-resolution fix), other files (`api/api.test.ts`, `api/resolution-debug.test.ts`, etc.) failed with errors like `Attempted to resolve unregistered dependency token: 'DependencyContainer'`.
    *   **Root Cause - Test Setup:** The inconsistency stemmed from incomplete/incorrect DI setup in the `beforeEach` blocks of the failing test files. They were missing registrations for core services, factories, and crucially, the 'DependencyContainer' token itself, which is required by factories like `InterpreterServiceClientFactory`. Standardizing the DI setup across these files resolved the 'DependencyContainer' errors.
    *   **`TestContextDI` Cleanup Issue:** Deeper investigation into the test utilities revealed that `TestContextDI.cleanup` used `clearInstances()` instead of `dispose()`. This likely caused container state leakage between test files, contributing to the DI instability and potentially the OOM error due to excessive object creation/retention.
    *   **Revised OOM Hypothesis:** The OOM is likely caused by the combination of recursive interpretation (`@import`), numerous service instantiations driven by inconsistent/leaky test container setups, and potentially inefficient state cloning (`StateFactory.createClonedState` deep-cloning variable maps).
    *   **Refactoring Plan:** A dedicated plan (`_plans/REFAC-SERVICE-TEST-DI.md`) was created to address the systemic test isolation issues by refactoring all service tests (`tests/services/**/*.test.ts`) to use the recommended "Manual Child Container" pattern with proper setup and `dispose()` cleanup. Addressing this is crucial for overall test suite stability and likely necessary to fully resolve the OOM error.
*   **Current Status:** The `@import` directive logic appears functional based on unit tests, but API integration testing is blocked by the persistent Heap OOM error. Investigation points towards test DI lifecycle/isolation issues being addressed by `_plans/REFAC-SERVICE-TEST-DI.md`.
*   **Next Steps:**
    1.  **(High Priority)** Continue executing the plan in `_plans/REFAC-SERVICE-TEST-DI.md` (Phases 1-4 COMPLETE, starting Phase 5 - Handlers).
    2.  **(Contingent on OOM resolution)** Re-run `api/integration.test.ts` after service test refactoring. If OOM persists, add detailed logging to `StateFactory.createClonedState` and `StateService.setVariable` to analyze object sizes during cloning/setting.
    3.  **(Deferred)** Address `@path` errors (Phase 4).
    4.  **(Deferred)** Address `@run` errors (Phase 3).
    5.  **(Deferred)** Remove the lazy-resolution workaround for `ICircularityService` in `ImportDirectiveHandler` if the root cause is confirmed to be fixed by the broader test refactoring.
    6.  **(NEW)** Add list of handler test files needing DI refactor:
        *   `services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.test.ts` - ✅ DONE (Already migrated)
        *   `services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts` - ❓ MISSING
        *   `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts` - ✅ DONE (Already migrated)
        *   `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.command.test.ts` - ✅ DONE (Refactored)
        *   `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts` - ✅ DONE (Refactored)
        *   `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts` - ✅ DONE (Refactored, 1 test skipped)
        *   `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts` - ✅ DONE (Refactored)
        *   `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts`
        *   `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts`
        *   `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts`
        *   `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts`

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

**Phase 6: Remaining/Minor Issues [Not Started]**

*   **Target Failures:** `api/api.test.ts` #3 (Example File Output), other output discrepancies.
*   **Investigation Steps:** Once other issues are resolved, revisit these tests. Analyze the expected vs. actual output. Trace `OutputService`.
*   **Fix & Verify:** Implement fixes. Update relevant tests.
