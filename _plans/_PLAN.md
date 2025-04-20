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

*   **Extensive Logging:** Due to potential console output suppression in the test environment (see `docs/dev/TESTS.md`), DO NOT USE `logger.debug` or `console.log` -- instead rely heavily on **`process.stdout.write('DEBUG: [ServiceName] Message\n');`** for detailed tracing.
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

*   **Target Failures:** `api/integration.test.ts` #1 (Variable/Data Resolution Regression).
*   **Hypothesized Services:** `InterpreterService`, `ResolutionService`, `StateService`, `VariableReferenceResolver`, `OutputService`.
*   **Investigation Steps:**
    1.  **Analyze `api/integration.test.ts` Context:** Why does basic `{{var}}` resolution fail here but pass in `api/array-access.test.ts` with the same DI setup? Are there subtle differences in the test structure, content order, or options passed to `processMeld`?
    2.  **Trace `InterpreterService`:** Add logging/debugging to trace the processing of the relevant `TextNode`s and `VariableReferenceNode`s. Confirm the correct state is being used when calling `ResolutionService`.
    3.  **Trace `ResolutionService.resolveNodes` / `VariableReferenceResolver`:** Add logging/debugging to trace the resolution flow for the specific failing variable. Check the state lookups (`context.state.getVariable`).
    4.  **Use Visualization:** In the failing test, call `stateVisualizationService.visualizeContextHierarchy` (or `visualizeVariablePropagation` if relevant) at key points (e.g., before/after the failing resolution) to understand the state structure and variable availability across contexts.
    5.  **Compare State Snapshots:** Compare the state (variables stored) just before the failing resolution attempt in `api/integration.test.ts` vs. a passing case. Is the variable correctly defined in the expected state instance?
*   **Fix & Verify:** Implement fixes in the identified service(s). Update relevant unit tests (`ResolutionService.test.ts`, `InterpreterService.unit.test.ts`, `StateService.test.ts`) using the refactoring pattern. Re-run `api/integration.test.ts` to confirm the fix.

**Phase 2: `@import` Directive Processing [In Progress - DI Issues]**

*   **Target Failures:** `api/integration.test.ts` #3 (`@import` Directive Processing), #4 (Circular Import Detection - Error Message).
*   **Hypothesized Services:** `InterpreterService`, `DirectiveService`, `ImportDirectiveHandler`, `StateService`, `ParserService`, `FileSystemService`, `InterpreterServiceClientFactory`, DI Container (`api/integration.test.ts`).
*   **Investigation Steps & Findings:**
    1.  **Initial Error:** `@import` tests initially failed with "Path validation failed for resolved path "": Path cannot be empty".
    2.  **Fix 1:** Modified `ImportDirectiveHandler` to perform two-step path resolution: first call `resolutionService.resolveInContext` on the `pathObject`, then pass the resulting *string* to `resolutionService.resolvePath`. This fixed the "Path cannot be empty" error for imports.
    3.  **New Error:** This unmasked a new failure in the same integration tests: "Interpreter service client is not available. Ensure InterpreterServiceClientFactory is registered and resolvable, or provide a mock in tests." This error originates from within `ImportDirectiveHandler` when it tries to use the `InterpreterServiceClient` (obtained via `InterpreterServiceClientFactory`) to interpret the imported file's content.
    4.  **Extensive DI Debugging:** Investigated the DI setup in `api/integration.test.ts` thoroughly:
        *   Confirmed registration of `InterpreterServiceClientFactory`, `IInterpreterService`, `IDirectiveService`, `IValidationService`, and all other known direct/indirect dependencies for `InterpreterService` and `DirectiveService`.
        *   Corrected the container usage within `InterpreterServiceClientFactory` to use the test-specific container instance instead of the global one.
        *   Experimented with adding/removing `delay()` for the circular dependency between `DirectiveService` and `InterpreterServiceClientFactory`.
        *   **Result:** None of these DI configuration changes resolved the "Interpreter service client is not available" error in the integration tests.
    5.  **Unit Test Validation:** Switched focus to `ImportDirectiveHandler.unit.test.ts`:
        *   Fixed several issues with test mocks (methods returning `{}` instead of `Map`, interactions with `delay()`).
        *   Modified tests to directly inject a mocked `IInterpreterServiceClient`, bypassing the factory.
        *   **Result:** The unit tests now pass (12/15), confirming the handler's *isolated* logic for parsing, interpreting (via mock), and merging state changes is mostly correct. The remaining 3 failures relate to mocking special path variable resolution in specific scenarios. (Update: These 3 were subsequently fixed by improving the mock state object). (Final Update: Unit tests now pass except for one minor assertion on circular error code).
    6.  **Current Status:** The handler logic appears sound in isolation. The persistent "Interpreter service client is not available" error in `api/integration.test.ts` strongly suggests a complex DI resolution failure specific to that test environment's container setup, possibly due to an unidentified transitive dependency or configuration interaction. The Heap OOM errors seen earlier were likely red herrings or masked by the DI failures.
*   **Next Steps:**
    1.  Fix the minor assertion logic for the circular import error code in `ImportDirectiveHandler.test.ts`.
    2.  Re-run `npm test api` to confirm the DI error ("Interpreter service client not available") is the primary remaining blocker for `@import` integration tests.
    3.  Systematically debug the DI resolution within `api/integration.test.ts` for `IInterpreterService`:
        *   Temporarily simplify the container setup (remove less critical registrations).
        *   Add logging *during* tsyringe's resolution process if possible (might require modifying tsyringe or using advanced techniques).
        *   Consider if any other core services (`ResolutionService`, `PathService`, etc.) also need to be singletons within the `testContainer`. (Tried `ResolutionService` singleton - no change).

**Phase 3: `@run` Directive Processing**

*   **Target Failures:** `api/api.test.ts` #1 (`@run` Directive Execution), #2 (Variable Resolution within `@run`).
*   **Hypothesized Services:** `InterpreterService`, `DirectiveService`, `RunDirectiveHandler`, `ResolutionService`, `ParserService`.
*   **Investigation Steps:**
    1.  **Command Parsing:** Add logging inside `RunDirectiveHandler.execute` to inspect the parsed command string *before* any variable resolution attempt. Why is it perceived as empty in the failing `api.test.ts` cases? Is the AST structure for `@run` correct or being misinterpreted?
    2.  **Variable Resolution in Command:** Add logging *before* command execution to trace the resolution of variables within the command string (e.g., `{{greeting}}` in `echo {{greeting}}`). Does it call `ResolutionService.resolveNodes` (or similar) on the command string/nodes? What is the result?
    3.  **Execution Logic:** Trace the actual command execution logic within the handler.
*   **Fix & Verify:** Implement fixes. Refactor/update `RunDirectiveHandler.test.ts`. Re-run failing `@run` tests in `api/api.test.ts`.

**Phase 4: Special Path Variable Resolution (`@path`)**

*   **Target Failures:** `api/integration.test.ts` #2 (Special Path Variable Resolution).
*   **Hypothesized Services:** `PathService`, `ResolutionService`, `PathDirectiveHandler`, `FileSystemServiceClientFactory` (and underlying client/FS).
*   **Investigation Steps:**
    1.  **Focus on `$PROJECTPATH`:** Use the `should handle path variables with special $PROJECTPATH syntax` test.
    2.  **Trace `PathDirectiveHandler`:** Log the path value received by the handler and the value passed to `ResolutionService` or `PathService`.
    3.  **Trace `ResolutionService` Path Alias Handling:** Add logging within `ResolutionService` (or `VariableReferenceResolver`) where `$PROJECTPATH`, `$.`, etc., should be identified and resolved. What value is being returned?
    4.  **Trace `PathService.validatePath`:** Log the `resolvedPath` value being received just before the "Path cannot be empty" error is thrown. Why is it empty?
    5.  **Verify `FileSystemServiceClient` Interaction:** Although we use the real factory, ensure the underlying `MemfsTestFileSystem` (mock `IFileSystem`) behaves as expected when `PathService` uses its client to check existence (this shouldn't cause an empty path, but good to confirm).
*   **Fix & Verify:** Implement fixes in `PathService` or `ResolutionService`. Refactor/update `PathDirectiveHandler.test.ts`, `PathService.test.ts`, `ResolutionService.test.ts`. Re-run failing path tests in `api/integration.test.ts`.

**Phase 5: Circular Import Detection**

*   **Target Failures:** `api/integration.test.ts` #4 (Circular Import Detection - throwing wrong error).
*   **Hypothesized Services:** `CircularityService`, `InterpreterService`, `ImportDirectiveHandler`, `StateService`.
*   **Investigation Steps:**
    1.  **Trace `CircularityService` Calls:** Add logging where `CircularityService.push` and `pop` (or equivalent methods) are called during the import process (likely within `InterpreterService` or `ImportDirectiveHandler`). Log the file paths being pushed/popped.
    2.  **Check Detection Logic:** Review the `CircularityService.check` (or equivalent) logic. Is it correctly identifying the loop based on the pushed paths?
    3.  **Verify Error Propagation:** If the error *is* detected by `CircularityService`, is it being correctly thrown and propagated up the call stack to cause `processMeld` to reject? Why is the wrong error ("Interpreter service client not available") being thrown instead? (Likely due to the DI issue preventing interpretation).
*   **Fix & Verify:** Implement fixes. Refactor/update `CircularityService.test.ts` and potentially `ImportDirectiveHandler.test.ts`. Re-run the circular import test after fixing the DI issue in Phase 2.

**Phase 6: Remaining/Minor Issues**

*   **Target Failures:** `api/api.test.ts` #3 (Example File Output), other output discrepancies.
*   **Investigation Steps:** Once other issues are resolved, revisit these tests. Analyze the expected vs. actual output. Trace `OutputService`.
*   **Fix & Verify:** Implement fixes. Update relevant tests.
