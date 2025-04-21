# Debug Log: Resolving API Test Failures (Variable Resolution)

## Initial Problem

After major refactors related to AST, State management, Types, and Directive Handlers, the API integration tests (`npm test api`) started failing with:

1.  JavaScript heap out of memory errors (OOM).
2.  Worker exited unexpectedly errors.
3.  Numerous specific test failures related to variable resolution and output formatting.

## Investigation & Fixes Summary

We systematically investigated the failures using extensive logging (`process.stdout.write`) and targeted code changes.

1.  **DI Issues:** Initial investigation focused on Dependency Injection setup in the API tests. We ensured core services like `IStateService` were registered correctly (often as singletons within the test scope) and resolved potential circular dependencies (e.g., using `delay()`). This fixed some initial test setup errors but not the core functional failures or OOM.

2.  **State Cloning Frequency:** We hypothesized that the frequent deep cloning of state (`lodash.cloneDeep` on variable maps within `StateFactory.updateState`) triggered by `StateService` methods like `addNode` and `setVariable` during the `InterpreterService` loop was causing the OOM.
    *   **Logging Added:** Added logs to `StateFactory.updateState` and `StateFactory.createClonedState` to track the approximate size of variable maps being cloned.
    *   **Finding:** Logs showed that variable map sizes remained small (`~2` entries) in the failing API tests. This indicated that *while frequent*, the cloning wasn't operating on excessively large *data*, making it less likely as the sole cause of the OOM, although it could contribute to memory pressure.

3.  **State Modification Return Types:** We identified and fixed inconsistencies between the `IStateService` interface and the `StateService` implementation regarding the return types of state modification methods (`addNode`, `setTextVar`, etc.). The implementation was updated to return `Promise<IStateService>` (returning `this`) to align with immutable patterns, and the interface was updated accordingly. This resolved linter errors but didn't fix the core variable resolution failures.

4.  **Variable Resolution Failure (`getAllVariables` TypeError):**
    *   Test failures clearly indicated variables were not being resolved correctly (e.g., `{{greeting}}` resolved to `''`).
    *   Logs revealed a `TypeError: currentState.getAllVariables is not a function` error occurring within `VariableReferenceResolver.getVariable`.
    *   **Fix:** Removed the erroneous `getAllVariables` call from the logging code within `VariableReferenceResolver.getVariable`.
    *   **Result:** This fixed the `TypeError` but *not* the underlying resolution failures; `getVariable` still reported variables as not found.

5.  **Variable Loss During State Update:**
    *   Detailed logging added to `StateService.setVariable` and `StateService.getVariable` revealed a contradiction:
        *   `setVariable` confirmed a variable (e.g., `greeting`) existed in the map of the *new state node* immediately after the update.
        *   However, a subsequent `getVariable` call on the *exact same state instance* (verified by state ID logging) failed to find the key, reporting the map as having incorrect keys (e.g., `[null]` or only later keys like `[name]`).
    *   **Root Cause:** The logic in `StateFactory.updateState` for creating the new state node was flawed. It was not correctly merging the incoming `updates` maps with the maps copied from the original `state` node. Instead of applying updates *to* the copies, it was sometimes replacing entire maps, causing data loss for variable types not included in that specific `updates` object.
    *   **Fix:** Corrected the map merging logic in `StateFactory.updateState`. The fix involved:
        1.  Creating new `Map` instances explicitly from the *original* state's maps (`new Map(state.variables.text)`, etc.).
        2.  Iterating through the maps provided in the `updates` argument.
        3.  Using `.set(key, cloneDeep(value))` to apply the updates onto the *newly created copies*.
        4.  Assigning these correctly merged maps to the new `StateNode`.
    *   **Result:** This resolved the variable loss, and subsequent test runs showed `getVariable` finding the correct variables.

6.  **`cloneDeep` Value Removal:** Temporarily removed `cloneDeep` on the *value* during the `.set()` operation in `StateFactory.updateState` to rule out `cloneDeep` itself corrupting the Map. This did *not* fix the issue, confirming `cloneDeep` on the value wasn't the cause of the variable loss.

7.  **Missing `name` Property in Handlers:**
    *   **Root Cause Re-evaluation:** Even after fixing the factory merging logic, `getVariable` logs showed the map keys were `[undefined]` instead of the expected variable names (like `['greeting']`).
    *   **Investigation:** Traced the `MeldVariable` object creation back to the definition handlers (`TextDirectiveHandler`, `DataDirectiveHandler`, etc.).
    *   **Bug:** Discovered these handlers were creating the `VariableDefinition` object (value for the `stateChanges.variables` map) *without* including the mandatory `name` property.
    *   **Fix:** Added the `name: identifier` property to the `VariableDefinition` objects created in `TextDirectiveHandler`, `DataDirectiveHandler`, `PathDirectiveHandler`, and `DefineDirectiveHandler`.
    *   **Result:** This **finally fixed the variable resolution failures**. Tests related to basic variable setting and lookup now pass.

## Current Status (After Variable Resolution Fixes)

*   **Variable Resolution:** Corrected. Tests dependent solely on setting and getting variables now pass.
*   **Output Formatting Failures:** 3 assertion errors remain in `api/api.test.ts` related to the final generated output string (incorrect newlines, empty output when content expected). This points to issues in `OutputService` or how the final node list is handled/passed by `InterpreterService` / `api/index.ts`.
*   **DI Failure:** The `api/debug-tools.integration.test.ts` still fails due to DI errors (`Failed to initialize necessary clients`).
*   **Heap / Worker Errors:** The tests still eventually crash with heap exhaustion / unexpected worker exit, although it takes longer now. This might be related to the remaining failing tests or other underlying performance/memory issues.

## Next Steps

1.  Address the output formatting failures in `api/api.test.ts`.
2.  Fix the DI setup in `api/debug-tools.integration.test.ts`.
3.  Re-evaluate the heap/worker errors after resolving the functional test failures. 